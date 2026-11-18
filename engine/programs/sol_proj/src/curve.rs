//! Linear bonding curve. Pure math, no Anchor, no accounts.
//!
//! Price at supply `s` is `SLOPE * s` lamports. The cost to move supply
//! from `lo` to `hi` is the area under the price line:
//! `SLOPE * (hi² - lo²) / 2`.
//!
//! Every function returns `None` on overflow or underflow.

/// Price increase per token, in lamports (0.001 SOL).
pub const SLOPE_LAMPORTS: u128 = 1_000_000;

/// Platform fee in basis points (500 = 5%).
pub const FEE_BPS: u64 = 500;

fn area(lo: u64, hi: u64) -> Option<u64> {
    let (lo, hi) = (lo as u128, hi as u128);
    let diff = hi.checked_mul(hi)?.checked_sub(lo.checked_mul(lo)?)?;
    u64::try_from(SLOPE_LAMPORTS.checked_mul(diff)? / 2).ok()
}

/// Lamports a buyer pays into the reserve to mint `amount` tokens.
pub fn buy_cost(supply: u64, amount: u64) -> Option<u64> {
    area(supply, supply.checked_add(amount)?)
}

/// Lamports the reserve releases when `amount` tokens are burned.
pub fn sell_refund(supply: u64, amount: u64) -> Option<u64> {
    area(supply.checked_sub(amount)?, supply)
}

/// Fee on a lamport amount. Never exceeds `lamports`, so it cannot overflow.
pub fn fee(lamports: u64) -> u64 {
    (lamports as u128 * FEE_BPS as u128 / 10_000) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_token_costs_half_slope() {
        assert_eq!(buy_cost(0, 1), Some(500_000));
        assert_eq!(buy_cost(0, 10), Some(50_000_000));
    }

    #[test]
    fn price_rises_with_supply() {
        assert!(buy_cost(100, 1).unwrap() > buy_cost(0, 1).unwrap());
    }

    #[test]
    fn sell_refunds_exactly_what_buy_cost() {
        // The reserve must always cover every outstanding token.
        for (supply, amount) in [(0, 1), (0, 1_000), (7, 13), (1_000_000, 42)] {
            assert_eq!(buy_cost(supply, amount), sell_refund(supply + amount, amount));
        }
    }

    #[test]
    fn split_buys_cost_the_same_as_one_buy() {
        let one = buy_cost(0, 100).unwrap();
        let split = buy_cost(0, 40).unwrap() + buy_cost(40, 60).unwrap();
        assert_eq!(one, split);
    }

    #[test]
    fn overflow_returns_none() {
        assert_eq!(buy_cost(u64::MAX, 1), None);
        assert_eq!(buy_cost(0, u64::MAX), None); // result does not fit in u64
        assert_eq!(sell_refund(5, 6), None);
    }

    #[test]
    fn fee_is_five_percent() {
        assert_eq!(fee(1_000_000), 50_000);
        assert_eq!(fee(19), 0);
        assert_eq!(fee(u64::MAX), u64::MAX / 20);
    }
}
