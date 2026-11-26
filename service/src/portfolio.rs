//! Fee-inclusive average-cost accounting over the complete committed trade ledger.
use super::*;
use std::collections::BTreeMap;

struct Position {
    quantity: u64,
    basis: u64,
    realized: i128,
    complete: bool,
}
impl Default for Position {
    fn default() -> Self {
        Self {
            quantity: 0,
            basis: 0,
            realized: 0,
            complete: true,
        }
    }
}
impl Position {
    fn apply(&mut self, side: &str, quantity: u64, total: u64) -> Result<()> {
        if quantity == 0 || !matches!(side, "buy" | "sell") {
            return Err(internal());
        }
        if side == "buy" {
            self.quantity = self.quantity.checked_add(quantity).ok_or_else(internal)?;
            self.basis = self.basis.checked_add(total).ok_or_else(internal)?;
        } else if quantity > self.quantity {
            // Legacy imports may have holdings with no purchase receipts. Never
            // manufacture a zero basis or claim their proceeds are all profit.
            self.complete = false;
            self.quantity = 0;
            self.basis = 0;
        } else {
            // Floor each partial-sale allocation. The rounding remainder stays
            // in the position; a full exit consumes it, leaving exactly zero.
            let allocated =
                (u128::from(self.basis) * u128::from(quantity) / u128::from(self.quantity)) as u64;
            self.quantity -= quantity;
            self.basis -= allocated;
            self.realized += i128::from(total) - i128::from(allocated);
        }
        Ok(())
    }
}

fn signed(value: i128) -> Result<i64> {
    i64::try_from(value).map_err(|_| internal())
}

pub(super) fn account(db: &Connection, id: &str, cash: u64) -> Result<Value> {
    let mut positions: BTreeMap<String, Position> = BTreeMap::new();
    let mut expected_cash = i128::from(INITIAL_CASH);
    // rowid is insertion order, including multiple trades in the same second.
    // Do not reuse the bounded receipt-list endpoint for accounting.
    let mut trades = db.prepare(
        "SELECT symbol,side,quantity,total_lamports FROM trades WHERE account_id=?1 ORDER BY rowid",
    )?;
    let mut rows = trades.query([id])?;
    while let Some(row) = rows.next()? {
        let symbol: String = row.get(0)?;
        let side: String = row.get(1)?;
        let quantity: u64 = row.get(2)?;
        let total: u64 = row.get(3)?;
        positions
            .entry(symbol)
            .or_default()
            .apply(&side, quantity, total)?;
        expected_cash += if side == "buy" {
            -i128::from(total)
        } else {
            i128::from(total)
        };
    }
    let cash_complete = expected_cash == i128::from(cash);
    let mut holdings = Vec::new();
    let mut value = 0_u64;
    let mut basis = 0_u64;
    let mut holdings_stmt = db.prepare(
        "SELECT h.symbol,h.quantity,m.supply FROM holdings h JOIN markets m USING(symbol) WHERE account_id=?1 AND quantity>0 ORDER BY h.symbol",
    )?;
    let mut rows = holdings_stmt.query([id])?;
    while let Some(row) = rows.next()? {
        let symbol: String = row.get(0)?;
        let quantity: u64 = row.get(1)?;
        let gross = curve::sell_refund(row.get(2)?, quantity).ok_or_else(internal)?;
        let liquidation = gross - curve::fee(gross);
        let position = positions.entry(symbol.clone()).or_default();
        position.complete &= cash_complete && position.quantity == quantity;
        value = value.checked_add(liquidation).ok_or_else(internal)?;
        basis = basis.checked_add(position.basis).ok_or_else(internal)?;
        holdings.push(json!({
            "symbol":symbol, "quantity":quantity, "liquidation_lamports":liquidation,
            "history_complete":position.complete,
            "cost_basis_lamports":position.complete.then_some(position.basis),
            "realized_pnl_lamports":position.complete.then_some(signed(position.realized)?),
            "unrealized_pnl_lamports":position.complete.then_some(signed(i128::from(liquidation)-i128::from(position.basis))?),
        }));
        // Mark observed positions so unmatched ledger balances fail reconciliation.
        position.quantity = 0;
    }
    let complete = cash_complete && positions.values().all(|p| p.complete && p.quantity == 0);
    let realized: i128 = positions.values().map(|p| p.realized).sum();
    let portfolio_value = cash.checked_add(value).ok_or_else(internal)?;
    Ok(json!({
        "cash_lamports":cash, "holdings":holdings, "mode":"paper",
        "performance": {
            "cost_basis_method":"average_cost",
            "history_complete":complete,
            "starting_balance_lamports":INITIAL_CASH,
            "holdings_value_lamports":value,
            "portfolio_value_lamports":portfolio_value,
            "total_change_lamports":signed(i128::from(portfolio_value)-i128::from(INITIAL_CASH))?,
            "cost_basis_lamports":complete.then_some(basis),
            "realized_pnl_lamports":complete.then_some(signed(realized)?),
            "unrealized_pnl_lamports":complete.then_some(signed(i128::from(value)-i128::from(basis))?),
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fractional_average_cost_keeps_remainder_until_exit() {
        let mut position = Position::default();
        position.apply("buy", 3, 101).unwrap();
        position.apply("sell", 1, 40).unwrap();
        assert_eq!(position.basis, 68);
        assert_eq!(position.realized, 7);
        position.apply("buy", 1, 17).unwrap();
        assert_eq!(position.basis, 85);
        position.apply("sell", 2, 60).unwrap();
        assert_eq!(position.basis, 29);
        assert_eq!(position.realized, 11);
        position.apply("sell", 1, 35).unwrap();
        assert_eq!(position.basis, 0);
        assert_eq!(position.quantity, 0);
        assert_eq!(position.realized, 40 + 60 + 35 - 101 - 17);
    }

    #[test]
    fn malformed_imported_receipt_cannot_divide_by_zero() {
        let mut position = Position::default();
        assert!(position.apply("sell", 0, 1).is_err());
        assert!(position.apply("buy", 0, 1).is_err());
        assert!(position.apply("unknown", 1, 1).is_err());
        assert_eq!(position.quantity, 0);
        assert_eq!(position.basis, 0);
    }
}
