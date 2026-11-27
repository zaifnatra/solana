use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount};

pub mod curve;

pub const MAX_ORDER: u64 = 10_000;
pub const MAX_SUPPLY: u64 = 100_000;
pub const MAX_QUOTE_LIFETIME: i64 = 60;

fn validate_order(amount: u64, expires_at: i64, now: i64) -> Result<()> {
    require!(
        amount > 0 && amount <= MAX_ORDER,
        ErrorCode::InvalidQuantity
    );
    require!(expires_at > now, ErrorCode::QuoteExpired);
    let latest = now
        .checked_add(MAX_QUOTE_LIFETIME)
        .ok_or(ErrorCode::MathOverflow)?;
    require!(expires_at <= latest, ErrorCode::InvalidExpiry);
    Ok(())
}

fn buy_supply(supply: u64, amount: u64) -> Result<u64> {
    let next = supply.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
    require!(next <= MAX_SUPPLY, ErrorCode::SupplyLimitExceeded);
    Ok(next)
}

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
        emit!(ArtistRegistered {
            artist: profile.authority,
            profile: profile.key(),
            token_mint: profile.token_mint,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn buy_token_bounded(
        ctx: Context<BuyToken>,
        amount: u64,
        max_total_lamports: u64,
        expires_at: i64,
    ) -> Result<()> {
        let timestamp = Clock::get()?.unix_timestamp;
        validate_order(amount, expires_at, timestamp)?;
        let supply = ctx.accounts.artist_profile.token_supply;
        let next_supply = buy_supply(supply, amount)?;
        let cost = curve::buy_cost(supply, amount).ok_or(ErrorCode::MathOverflow)?;
        let fee = curve::fee(cost);
        let total = cost.checked_add(fee).ok_or(ErrorCode::MathOverflow)?;
        require!(total <= max_total_lamports, ErrorCode::PriceLimitExceeded);

        // Cost goes to the artist reserve (the profile PDA), fee to the platform.
        let system = ctx.accounts.system_program.to_account_info();
        let buyer = ctx.accounts.buyer.to_account_info();
        for (to, lamports) in [
            (ctx.accounts.artist_profile.to_account_info(), cost),
            (ctx.accounts.platform_wallet.to_account_info(), fee),
        ] {
            let accounts = system_program::Transfer {
                from: buyer.clone(),
                to,
            };
            system_program::transfer(CpiContext::new(system.clone(), accounts), lamports)?;
        }

        let profile = &mut ctx.accounts.artist_profile;
        let seeds: &[&[u8]] = &[
            b"artist",
            profile.authority.as_ref(),
            &[profile.profile_bump],
        ];
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

        profile.token_supply = next_supply;
        emit!(TradeExecuted {
            artist: profile.authority,
            trader: ctx.accounts.buyer.key(),
            token_mint: profile.token_mint,
            is_buy: true,
            amount,
            gross_lamports: cost,
            fee_lamports: fee,
            total_lamports: total,
            supply_before: supply,
            supply_after: next_supply,
            timestamp,
        });
        Ok(())
    }

    pub fn sell_token_bounded(
        ctx: Context<SellToken>,
        amount: u64,
        min_total_lamports: u64,
        expires_at: i64,
    ) -> Result<()> {
        let timestamp = Clock::get()?.unix_timestamp;
        validate_order(amount, expires_at, timestamp)?;
        let supply = ctx.accounts.artist_profile.token_supply;
        let refund = curve::sell_refund(supply, amount).ok_or(ErrorCode::MathOverflow)?;
        let fee = curve::fee(refund);
        let total = refund.checked_sub(fee).ok_or(ErrorCode::MathOverflow)?;
        require!(total >= min_total_lamports, ErrorCode::PriceLimitExceeded);

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
        let remaining = profile_info
            .lamports()
            .checked_sub(refund)
            .ok_or(ErrorCode::InsufficientReserve)?;
        require_gte!(remaining, rent_min, ErrorCode::InsufficientReserve);

        // The PDA owns its lamports, so it can debit them directly.
        **profile_info.try_borrow_mut_lamports()? = remaining;
        **ctx
            .accounts
            .seller
            .to_account_info()
            .try_borrow_mut_lamports()? += total;
        **ctx
            .accounts
            .platform_wallet
            .to_account_info()
            .try_borrow_mut_lamports()? += fee;

        let profile = &mut ctx.accounts.artist_profile;
        profile.token_supply = supply - amount; // checked inside sell_refund
        emit!(TradeExecuted {
            artist: profile.authority,
            trader: ctx.accounts.seller.key(),
            token_mint: profile.token_mint,
            is_buy: false,
            amount,
            gross_lamports: refund,
            fee_lamports: fee,
            total_lamports: total,
            supply_before: supply,
            supply_after: profile.token_supply,
            timestamp,
        });
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

    // Owner-only redemption: approved SPL delegates cannot redeem into their own SOL wallet.
    #[account(mut, token::mint = token_mint, token::authority = seller)]
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
    /// Curve-issued supply net of program redemptions. An external SPL burn is a
    /// donation: it does not lower this counter or release reserve. This preserves
    /// existing redemption economics and can leave permanently unclaimed reserve.
    pub token_supply: u64,
    pub profile_bump: u8,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Math overflow.")]
    MathOverflow,
    #[msg("Reserve cannot cover this sale and stay rent-exempt.")]
    InsufficientReserve,
    #[msg("Order quantity must be between 1 and 10000 tokens.")]
    InvalidQuantity,
    #[msg("Quote expired; request a fresh quote.")]
    QuoteExpired,
    #[msg("Quote expiry must be within 60 seconds of the chain clock.")]
    InvalidExpiry,
    #[msg("Buy would exceed the market supply cap.")]
    SupplyLimitExceeded,
    #[msg("Execution price exceeds the signed fee-inclusive limit.")]
    PriceLimitExceeded,
}

#[event]
pub struct ArtistRegistered {
    pub artist: Pubkey,
    pub profile: Pubkey,
    pub token_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TradeExecuted {
    pub artist: Pubkey,
    pub trader: Pubkey,
    pub token_mint: Pubkey,
    pub is_buy: bool,
    pub amount: u64,
    pub gross_lamports: u64,
    pub fee_lamports: u64,
    pub total_lamports: u64,
    pub supply_before: u64,
    pub supply_after: u64,
    pub timestamp: i64,
}

#[cfg(test)]
mod order_tests {
    use super::*;

    #[test]
    fn bounded_instruction_discriminators_cannot_dispatch_to_legacy_trades() {
        use anchor_lang::Discriminator;
        assert_eq!(
            instruction::BuyTokenBounded::DISCRIMINATOR,
            &[34, 39, 248, 194, 140, 154, 2, 184]
        );
        assert_eq!(
            instruction::SellTokenBounded::DISCRIMINATOR,
            &[208, 134, 122, 98, 49, 103, 152, 175]
        );
        assert_ne!(
            instruction::BuyTokenBounded::DISCRIMINATOR,
            &[138, 127, 14, 91, 38, 87, 115, 105]
        );
        assert_ne!(
            instruction::SellTokenBounded::DISCRIMINATOR,
            &[109, 61, 40, 187, 230, 176, 135, 174]
        );
    }

    #[test]
    fn quote_deadline_and_quantity_bounds() {
        assert!(validate_order(1, 101, 100).is_ok());
        assert!(validate_order(MAX_ORDER, 160, 100).is_ok());
        assert!(validate_order(0, 101, 100).is_err());
        assert!(validate_order(MAX_ORDER + 1, 101, 100).is_err());
        assert!(validate_order(1, 100, 100).is_err());
        assert!(validate_order(1, 99, 100).is_err());
        assert!(validate_order(1, 161, 100).is_err());
    }

    #[test]
    fn supply_cap_only_applies_to_new_buys() {
        assert_eq!(buy_supply(MAX_SUPPLY - 1, 1).unwrap(), MAX_SUPPLY);
        assert!(buy_supply(MAX_SUPPLY, 1).is_err());
        assert!(buy_supply(u64::MAX, 1).is_err());
        // Legacy markets above the cap can still redeem through the same curve.
        assert!(curve::sell_refund(MAX_SUPPLY + 1, 1).is_some());
    }
}
