use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, MintTo, Burn, Token, TokenAccount};

declare_id!("9S4hFwHxdjnn5KHrFqxgxQJwu53hmGZ6A9EnkVsY96Va");

#[program]
pub mod sol_proj {
    use super::*;

    pub fn register_artist(ctx: Context<RegisterArtist>) -> Result<()> {
        let profile = &mut ctx.accounts.artist_profile;
        profile.authority = ctx.accounts.authority.key();
        profile.token_mint = ctx.accounts.token_mint.key();
        profile.token_supply = 0;
        profile.profile_bump = ctx.bumps.artist_profile;
        // The mint_bump is not stored but used during initialization via seeds
        Ok(())
    }

    pub fn buy_token(ctx: Context<BuyToken>, amount: u64) -> Result<()> {
        let profile = &mut ctx.accounts.artist_profile;
        
        // Simple Linear Bonding Curve: Price = Supply.
        // Cost to mint 'amount' starting at 'current_supply' is roughly integral of x dx.
        // For simplicity here: Price per token = 0.0001 SOL * (Current Supply + 1).
        // Total Cost ~ Price * Amount.
        // REAL IMPLEMENTATION SHOULD USE BIG MATH. 
        // We will use a simplified fixed rate for this demo: 0.01 SOL per token flat for MVP simplicity, 
        // PROPER CURVE requires: Cost = ( (Supply + Amount)^2 - Supply^2 ) / 2 * ScalingFactor
        
        let price_per_token_lamports = 10_000_000; // 0.01 SOL
        let cost = amount.checked_mul(price_per_token_lamports).unwrap();

        // 1. Transfer SOL from user to profile PDA
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: profile.to_account_info(),
            },
        );
        system_program::transfer(cpi_context, cost)?;

        // 2. Mint tokens to user
        let seeds = &[
            b"artist",
            profile.authority.as_ref(),
            &[profile.profile_bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.token_mint.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: profile.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::mint_to(cpi_ctx, amount)?;

        // Update supply
        profile.token_supply += amount;

        msg!("Bought {} tokens for {} lamports", amount, cost);
        Ok(())
    }

    pub fn sell_token(ctx: Context<SellToken>, amount: u64) -> Result<()> {
         let profile = &mut ctx.accounts.artist_profile;

        // Symmetric pricing: 0.01 SOL per token
        let price_per_token_lamports = 10_000_000; 
        let refund = amount.checked_mul(price_per_token_lamports).unwrap();

        // 1. Burn tokens from user
        let cpi_accounts = Burn {
            mint: ctx.accounts.token_mint.to_account_info(),
            from: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::burn(cpi_ctx, amount)?;

        // 2. Transfer SOL from profile PDA to user
        **profile.to_account_info().try_borrow_mut_lamports()? -= refund;
        **ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()? += refund;

        // Update supply
        profile.token_supply -= amount;

        msg!("Sold {} tokens for {} lamports", amount, refund);
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

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
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
