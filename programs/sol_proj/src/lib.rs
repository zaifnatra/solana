use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, MintTo, Burn, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("9TRyxmjsRxghBXVknyZ4ENzckCWsAKgpS43328roSoB6");

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
        
        // Linear Bonding Curve: Price = m * Supply
        // m = 0.001 SOL (1,000,000 lamports)
        // Cost = Integral(m * x dx) from S to S+A
        // Cost = (m / 2) * ((S + A)^2 - S^2)
        
        let m: u128 = 1_000_000; // Slope in lamports
        let current_supply = profile.token_supply as u128;
        let amount_u128 = amount as u128;
        let new_supply = current_supply.checked_add(amount_u128).ok_or(ErrorCode::Overflow)?;
        
        // Calculate Cost
        // Cost = (m * (new_supply^2 - current_supply^2)) / 2
        let term1 = new_supply.checked_mul(new_supply).ok_or(ErrorCode::Overflow)?;
        let term2 = current_supply.checked_mul(current_supply).ok_or(ErrorCode::Overflow)?;
        let diff = term1.checked_sub(term2).ok_or(ErrorCode::Overflow)?;
        let cost_u128 = m.checked_mul(diff).ok_or(ErrorCode::Overflow)?.checked_div(2).ok_or(ErrorCode::Overflow)?;
        let cost = cost_u128 as u64;

        // Calculate Fee (5%)
        let fee = cost.checked_mul(5).unwrap().checked_div(100).unwrap();
        let _total_amount = cost.checked_add(fee).ok_or(ErrorCode::Overflow)?;

        // 1. Transfer Total Cost (Cost + Fee) from user to program
        // We transfer 'Cost' to the Artist PDA (reserve) and 'Fee' to the Platform Wallet
        
        // Transfer Cost to Artist PDA
        let cpi_context_cost = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: profile.to_account_info(),
            },
        );
        system_program::transfer(cpi_context_cost, cost)?;

        // Transfer Fee to Platform Wallet
        let cpi_context_fee = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.platform_wallet.to_account_info(),
            },
        );
        system_program::transfer(cpi_context_fee, fee)?;

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
        profile.token_supply = new_supply as u64;

        msg!("Bought {} tokens for {} lamports (Fee: {})", amount, cost, fee);
        Ok(())
    }

    pub fn sell_token(ctx: Context<SellToken>, amount: u64) -> Result<()> {
         let profile = &mut ctx.accounts.artist_profile;

        // Same formula for refund
        let m: u128 = 1_000_000;
        let current_supply = profile.token_supply as u128;
        let amount_u128 = amount as u128;
        let new_supply = current_supply.checked_sub(amount_u128).ok_or(ErrorCode::Underflow)?;

        // Calculate Refund
        // Refund = (m * (current_supply^2 - new_supply^2)) / 2
        let term1 = current_supply.checked_mul(current_supply).ok_or(ErrorCode::Overflow)?;
        let term2 = new_supply.checked_mul(new_supply).ok_or(ErrorCode::Overflow)?;
        let diff = term1.checked_sub(term2).ok_or(ErrorCode::Overflow)?;
        let refund_u128 = m.checked_mul(diff).ok_or(ErrorCode::Overflow)?.checked_div(2).ok_or(ErrorCode::Overflow)?;
        let refund = refund_u128 as u64;

        // Calculate Fee (5%)
        let fee = refund.checked_mul(5).unwrap().checked_div(100).unwrap();
        let amount_to_user = refund.checked_sub(fee).ok_or(ErrorCode::Underflow)?;

        // 1. Burn tokens from user
        let cpi_accounts = Burn {
            mint: ctx.accounts.token_mint.to_account_info(),
            from: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::burn(cpi_ctx, amount)?;

        // 2. Transfer Refund - Fee from Profile PDA to User
        **profile.to_account_info().try_borrow_mut_lamports()? -= amount_to_user;
        **ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()? += amount_to_user;

        // 3. Transfer Fee from Profile PDA to Platform Wallet
        if fee > 0 {
             **profile.to_account_info().try_borrow_mut_lamports()? -= fee;
             **ctx.accounts.platform_wallet.to_account_info().try_borrow_mut_lamports()? += fee;
        }

        // Update supply
        profile.token_supply = new_supply as u64;

        msg!("Sold {} tokens for {} lamports (Fee: {})", amount, amount_to_user, fee);
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
    
    /// CHECK: This is the platform fee wallet. In a real app, validate the address.
    #[account(mut)]
    pub platform_wallet: AccountInfo<'info>,

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

    /// CHECK: This is the platform fee wallet. In a real app, validate the address.
    #[account(mut)]
    pub platform_wallet: AccountInfo<'info>,

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
    Overflow,
    #[msg("Math underflow.")]
    Underflow,
}
