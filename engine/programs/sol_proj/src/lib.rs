use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, MintTo, Burn, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;

pub mod curve;

declare_id!("8MJTdU3QNxhcNkU2QT88DV7quGMK5iWq4673rDsdLFjR");

/// The only account allowed to receive trading fees.
pub const PLATFORM_WALLET: Pubkey = pubkey!("7i4y4j4NwphNWJ92SGEEF1vToojQ9LLWGjccQawi56fm");

#[program]
pub mod sol_proj {
    use super::*;

    pub fn register_artist(ctx: Context<RegisterArtist>) -> Result<()> {
        let profile = &mut ctx.accounts.artist_profile;
        profile.authority = ctx.accounts.authority.key();
        profile.token_mint = ctx.accounts.token_mint.key();
        profile.token_supply = 0;
        profile.profile_bump = ctx.bumps.artist_profile;
        Ok(())
    }

    pub fn buy_token(ctx: Context<BuyToken>, amount: u64) -> Result<()> {
        let supply = ctx.accounts.artist_profile.token_supply;
        let cost = curve::buy_cost(supply, amount).ok_or(ErrorCode::MathOverflow)?;
        let fee = curve::fee(cost);

        // Cost goes to the artist reserve (the profile PDA), fee to the platform.
        let system = ctx.accounts.system_program.to_account_info();
        let buyer = ctx.accounts.buyer.to_account_info();
        for (to, lamports) in [
            (ctx.accounts.artist_profile.to_account_info(), cost),
            (ctx.accounts.platform_wallet.to_account_info(), fee),
        ] {
            let accounts = system_program::Transfer { from: buyer.clone(), to };
            system_program::transfer(CpiContext::new(system.clone(), accounts), lamports)?;
        }

        let profile = &mut ctx.accounts.artist_profile;
        let seeds: &[&[u8]] = &[b"artist", profile.authority.as_ref(), &[profile.profile_bump]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: profile.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        profile.token_supply = supply + amount; // checked inside buy_cost
        msg!("Bought {} tokens for {} lamports (fee {})", amount, cost, fee);
        Ok(())
    }

    pub fn sell_token(ctx: Context<SellToken>, amount: u64) -> Result<()> {
        let supply = ctx.accounts.artist_profile.token_supply;
        let refund = curve::sell_refund(supply, amount).ok_or(ErrorCode::MathOverflow)?;
        let fee = curve::fee(refund);

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.token_mint.to_account_info(),
                    from: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            amount,
        )?;

        // The reserve must stay rent-exempt after it pays out the full refund.
        let profile_info = ctx.accounts.artist_profile.to_account_info();
        let rent_min = Rent::get()?.minimum_balance(profile_info.data_len());
        let remaining = profile_info.lamports().checked_sub(refund).ok_or(ErrorCode::InsufficientReserve)?;
        require_gte!(remaining, rent_min, ErrorCode::InsufficientReserve);

        // The PDA owns its lamports, so it can debit them directly.
        **profile_info.try_borrow_mut_lamports()? = remaining;
        **ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()? += refund - fee;
        **ctx.accounts.platform_wallet.to_account_info().try_borrow_mut_lamports()? += fee;

        ctx.accounts.artist_profile.token_supply = supply - amount; // checked inside sell_refund
        msg!("Sold {} tokens for {} lamports (fee {})", amount, refund - fee, fee);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct RegisterArtist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    // The PDA that stores artist state. It will also be the Mint Authority.
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 8 + 1 + 1,
        seeds = [b"artist", authority.key().as_ref()],
        bump
    )]
    pub artist_profile: Account<'info, ArtistProfile>,

    // The SPL Token Mint. We create it here.
    #[account(
        init,
        payer = authority,
        mint::decimals = 0,
        mint::authority = artist_profile,
        mint::freeze_authority = artist_profile,
        seeds = [b"mint", authority.key().as_ref()],
        bump
    )]
    pub token_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct BuyToken<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"artist", artist_profile.authority.key().as_ref()],
        bump = artist_profile.profile_bump
    )]
    pub artist_profile: Account<'info, ArtistProfile>,

    #[account(
        mut,
        address = artist_profile.token_mint
    )]
    pub token_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = token_mint,
        associated_token::authority = buyer,
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut, address = PLATFORM_WALLET)]
    pub platform_wallet: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct SellToken<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"artist", artist_profile.authority.key().as_ref()],
        bump = artist_profile.profile_bump
    )]
    pub artist_profile: Account<'info, ArtistProfile>,

    #[account(
        mut,
        address = artist_profile.token_mint
    )]
    pub token_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut, address = PLATFORM_WALLET)]
    pub platform_wallet: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct ArtistProfile {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub token_supply: u64,
    pub profile_bump: u8,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Math overflow.")]
    MathOverflow,
    #[msg("Reserve cannot cover this sale and stay rent-exempt.")]
    InsufficientReserve,
}
