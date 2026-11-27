//! Versioned SHA-256 receipt chains. A retained checkpoint is the external trust anchor.
//! This journal provides no consensus, proof of ownership, or protection against a
//! database owner rewriting the entire history before anybody retains a checkpoint.
use crate::{TRADE_COLUMNS, Trade};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    error::Error,
    io::{BufRead, Read},
};

pub type AuditResult<T> = Result<T, Box<dyn Error + Send + Sync>>;
pub const PAGE_SIZE: u64 = 500;
const MAX_PAGE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Checkpoint {
    pub version: u32,
    pub account_id: String,
    pub sequence: u64,
    pub hash: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry {
    pub sequence: u64,
    pub previous_hash: String,
    pub hash: String,
    pub trade: Trade,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Page {
    pub checkpoint: Checkpoint,
    pub after: u64,
    pub entries: Vec<Entry>,
    pub next_after: u64,
    pub has_more: bool,
}

fn string(hash: &mut Sha256, value: &str) {
    hash.update((value.len() as u64).to_be_bytes());
    hash.update(value.as_bytes());
}
pub fn genesis(account: &str) -> String {
    let mut hash = Sha256::new();
    hash.update(b"MTL-AUDIT-GENESIS-v1\0");
    string(&mut hash, account);
    format!("{:x}", hash.finalize())
}
pub fn entry_hash(account: &str, sequence: u64, previous: &str, trade: &Trade) -> String {
    let mut hash = Sha256::new();
    hash.update(b"MTL-AUDIT-ENTRY-v1\0");
    string(&mut hash, account);
    hash.update(sequence.to_be_bytes());
    string(&mut hash, previous);
    for value in [&trade.id, &trade.symbol, &trade.side] {
        string(&mut hash, value);
    }
    for value in [
        trade.quantity,
        trade.gross_lamports,
        trade.fee_lamports,
        trade.total_lamports,
        trade.created_at,
    ] {
        hash.update(value.to_be_bytes());
    }
    format!("{:x}", hash.finalize())
}
fn valid_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn validate_checkpoint(checkpoint: &Checkpoint) -> AuditResult<()> {
    if checkpoint.version != 1
        || checkpoint.account_id.is_empty()
        || checkpoint.account_id.len() > 128
        || !valid_hash(&checkpoint.hash)
    {
        return Err("unsupported or malformed checkpoint".into());
    }
    if checkpoint.sequence == 0 && checkpoint.hash != genesis(&checkpoint.account_id) {
        return Err("invalid genesis checkpoint".into());
    }
    Ok(())
}
fn validate_entry(account: &str, sequence: u64, previous: &str, entry: &Entry) -> AuditResult<()> {
    if entry.sequence != sequence
        || entry.previous_hash != previous
        || !valid_hash(&entry.hash)
        || entry.hash != entry_hash(account, sequence, previous, &entry.trade)
    {
        return Err(format!("audit mismatch at sequence {sequence}").into());
    }
    Ok(())
}
pub fn checkpoint(db: &Connection, account: &str) -> AuditResult<Checkpoint> {
    let exists: bool = db.query_row(
        "SELECT EXISTS(SELECT 1 FROM accounts WHERE id=?1)",
        [account],
        |r| r.get(0),
    )?;
    if !exists {
        return Err("unknown account".into());
    }
    let head: Option<(u64, String)> = db.query_row(
        "SELECT sequence,entry_hash FROM trade_audit WHERE account_id=?1 ORDER BY sequence DESC LIMIT 1",
        [account], |r| Ok((r.get(0)?, r.get(1)?)),
    ).optional()?;
    let (sequence, hash) = head.unwrap_or_else(|| (0, genesis(account)));
    let checkpoint = Checkpoint {
        version: 1,
        account_id: account.into(),
        sequence,
        hash,
    };
    validate_checkpoint(&checkpoint)?;
    Ok(checkpoint)
}
fn hash_at(db: &Connection, account: &str, sequence: u64) -> AuditResult<String> {
    if sequence == 0 {
        return Ok(genesis(account));
    }
    Ok(db.query_row(
        "SELECT entry_hash FROM trade_audit WHERE account_id=?1 AND sequence=?2",
        params![account, sequence],
        |r| r.get(0),
    )?)
}

/// The caller supplies the same SQLite transaction that settles the trade.
pub(crate) fn append(db: &Connection, account: &str, trade: &Trade) -> AuditResult<()> {
    let head = checkpoint(db, account)?;
    let sequence = head
        .sequence
        .checked_add(1)
        .ok_or("audit sequence overflow")?;
    let hash = entry_hash(account, sequence, &head.hash, trade);
    db.execute("INSERT INTO trade_audit(account_id,sequence,trade_id,previous_hash,entry_hash) VALUES(?1,?2,?3,?4,?5)", params![account,sequence,trade.id,head.hash,hash])?;
    Ok(())
}
pub(crate) fn backfill(db: &Connection) -> AuditResult<()> {
    // Baseline the existing ledger in insertion order; this does not authenticate
    // history that predates migration. No monetary state or old receipt is changed.
    let mut stmt = db.prepare(&format!(
        "SELECT account_id,{TRADE_COLUMNS} FROM trades ORDER BY rowid"
    ))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let account: String = row.get(0)?;
        let trade = Trade {
            id: row.get(1)?,
            symbol: row.get(2)?,
            side: row.get(3)?,
            quantity: row.get(4)?,
            gross_lamports: row.get(5)?,
            fee_lamports: row.get(6)?,
            total_lamports: row.get(7)?,
            created_at: row.get(8)?,
        };
        append(db, &account, &trade)?;
    }
    Ok(())
}

/// Page a frozen prefix. Keeping `through` fixed prevents a moving export boundary.
pub fn page(db: &Connection, account: &str, after: u64, through: u64) -> AuditResult<Page> {
    let head = checkpoint(db, account)?;
    if after > through || through > head.sequence {
        return Err("invalid audit range".into());
    }
    let checkpoint = Checkpoint {
        sequence: through,
        hash: hash_at(db, account, through)?,
        ..head
    };
    let end = after.saturating_add(PAGE_SIZE).min(through);
    let mut stmt = db.prepare("SELECT a.sequence,a.previous_hash,a.entry_hash,t.id,t.symbol,t.side,t.quantity,t.gross_lamports,t.fee_lamports,t.total_lamports,t.created_at FROM trade_audit a JOIN trades t ON t.id=a.trade_id AND t.account_id=a.account_id WHERE a.account_id=?1 AND a.sequence>?2 AND a.sequence<=?3 ORDER BY a.sequence")?;
    let entries = stmt
        .query_map(params![account, after, end], |row| {
            Ok(Entry {
                sequence: row.get(0)?,
                previous_hash: row.get(1)?,
                hash: row.get(2)?,
                trade: Trade {
                    id: row.get(3)?,
                    symbol: row.get(4)?,
                    side: row.get(5)?,
                    quantity: row.get(6)?,
                    gross_lamports: row.get(7)?,
                    fee_lamports: row.get(8)?,
                    total_lamports: row.get(9)?,
                    created_at: row.get(10)?,
                },
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    if entries.len() as u64 != end - after {
        return Err("audit sequence gap or missing receipt".into());
    }
    let mut previous = hash_at(db, account, after)?;
    for (offset, entry) in entries.iter().enumerate() {
        validate_entry(account, after + offset as u64 + 1, &previous, entry)?;
        previous.clone_from(&entry.hash);
    }
    if end == through && previous != checkpoint.hash {
        return Err("audit checkpoint mismatch".into());
    }
    Ok(Page {
        checkpoint,
        after,
        entries,
        next_after: end,
        has_more: end < through,
    })
}

/// Verify against receipt rows as well as the hash links. Call inside a snapshot.
pub fn check_database(db: &Connection) -> AuditResult<()> {
    let version: u32 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version != 3 {
        return Err("audit verification requires database schema 3".into());
    }
    let trades: u64 = db.query_row("SELECT COUNT(*) FROM trades", [], |r| r.get(0))?;
    let entries: u64 = db.query_row("SELECT COUNT(*) FROM trade_audit", [], |r| r.get(0))?;
    if trades != entries {
        return Err("receipt/audit counts differ".into());
    }
    let invalid: u64 = db.query_row("SELECT COUNT(*) FROM trade_audit a LEFT JOIN trades t ON t.id=a.trade_id LEFT JOIN accounts u ON u.id=a.account_id WHERE t.id IS NULL OR u.id IS NULL OR t.account_id!=a.account_id", [], |r| r.get(0))?;
    if invalid != 0 {
        return Err("orphaned or cross-account audit entry".into());
    }
    let mut stmt = db.prepare("SELECT id FROM accounts ORDER BY id")?;
    let accounts = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    for account in accounts {
        let through = checkpoint(db, &account)?.sequence;
        let mut after = 0;
        loop {
            let batch = page(db, &account, after, through)?;
            after = batch.next_after;
            if !batch.has_more {
                break;
            }
        }
    }
    Ok(())
}

/// Verify JSONL pages in constant space, from genesis through their declared head.
/// An optional older, independently retained checkpoint detects rewritten history
/// or truncation before that checkpoint, including when all hashes were recomputed.
pub fn verify(reader: impl BufRead, trusted: Option<&Checkpoint>) -> AuditResult<Checkpoint> {
    if let Some(anchor) = trusted {
        validate_checkpoint(anchor)?;
    }
    let mut reader = reader;
    let mut head: Option<Checkpoint> = None;
    let mut sequence = 0_u64;
    let mut previous = String::new();
    let mut anchor_seen = trusted.is_none();
    let mut finished = false;
    loop {
        let mut line = String::new();
        let size = reader
            .by_ref()
            .take(MAX_PAGE_BYTES + 1)
            .read_line(&mut line)?;
        if size == 0 {
            break;
        }
        if size as u64 > MAX_PAGE_BYTES {
            return Err("audit page exceeds size limit".into());
        }
        if finished {
            return Err("unexpected data after final audit page".into());
        }
        let batch: Page = serde_json::from_str(&line)?;
        validate_checkpoint(&batch.checkpoint)?;
        if head.is_none() {
            if let Some(anchor) = trusted {
                if anchor.account_id != batch.checkpoint.account_id
                    || anchor.sequence > batch.checkpoint.sequence
                {
                    return Err("trusted checkpoint is not in this history".into());
                }
                if anchor.sequence == 0 {
                    anchor_seen = true;
                }
            }
            previous = genesis(&batch.checkpoint.account_id);
            head = Some(batch.checkpoint.clone());
        }
        if head.as_ref() != Some(&batch.checkpoint)
            || batch.after != sequence
            || batch.entries.len() > PAGE_SIZE as usize
        {
            return Err("inconsistent audit pages".into());
        }
        for entry in &batch.entries {
            sequence = sequence.checked_add(1).ok_or("audit sequence overflow")?;
            validate_entry(&batch.checkpoint.account_id, sequence, &previous, entry)?;
            previous.clone_from(&entry.hash);
            if let Some(anchor) = trusted
                && sequence == anchor.sequence
            {
                if previous != anchor.hash {
                    return Err("trusted checkpoint mismatch".into());
                }
                anchor_seen = true;
            }
        }
        if sequence > batch.checkpoint.sequence
            || batch.next_after != sequence
            || batch.has_more != (sequence < batch.checkpoint.sequence)
            || (batch.has_more && batch.entries.is_empty())
        {
            return Err("invalid audit page boundary".into());
        }
        finished = !batch.has_more;
    }
    let head = head.ok_or("empty audit export")?;
    if !finished || sequence != head.sequence || previous != head.hash || !anchor_seen {
        return Err("incomplete or truncated audit export".into());
    }
    Ok(head)
}

pub(crate) fn api_error(error: Box<dyn Error + Send + Sync>) -> crate::ApiError {
    tracing::error!(%error, "audit integrity check failed");
    crate::internal()
}

#[derive(Deserialize)]
pub(crate) struct Query {
    #[serde(default)]
    after: u64,
    through: Option<u64>,
}
pub(crate) async fn export(
    axum::extract::State(state): axum::extract::State<crate::AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::Query(query): axum::extract::Query<Query>,
) -> crate::Result<axum::Json<Page>> {
    let hash = crate::token_hash(&headers)?;
    state
        .run(move |db| {
            let tx = db.transaction()?;
            let (account, _) = crate::authenticate(&tx, &hash)?;
            let head = checkpoint(&tx, &account).map_err(api_error)?;
            let through = query.through.unwrap_or(head.sequence);
            if query.after > through || through > head.sequence {
                return Err(crate::invalid("Invalid audit range"));
            }
            page(&tx, &account, query.after, through)
                .map(axum::Json)
                .map_err(api_error)
        })
        .await
}
