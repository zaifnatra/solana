//! Offline audit tools. Database commands never migrate or write the database.
use mtl_service::audit::{self, AuditResult, Checkpoint};
use rusqlite::{Connection, OpenFlags};
use std::{
    fs::File,
    io::{self, BufReader, Read, Write},
};

fn run(args: &[String]) -> AuditResult<()> {
    match args {
        [command, path] if command == "check-db" => {
            let mut db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            let tx = db.transaction()?;
            audit::check_database(&tx)?;
            println!("Audit journal verified (internal consistency; no external checkpoint).");
        }
        [command, path, account] if command == "export" => {
            let mut db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            let tx = db.transaction()?;
            let version: u32 = tx.query_row("PRAGMA user_version", [], |r| r.get(0))?;
            if version != 3 { return Err("export requires database schema 3".into()); }
            let through = audit::checkpoint(&tx, account)?.sequence;
            let mut after = 0;
            let mut out = io::BufWriter::new(io::stdout().lock());
            loop {
                let page = audit::page(&tx, account, after, through)?;
                serde_json::to_writer(&mut out, &page)?;
                writeln!(out)?;
                after = page.next_after;
                if !page.has_more { break; }
            }
            out.flush()?;
        }
        [command, path, rest @ ..] if command == "verify" && rest.len() <= 1 => {
            let anchor: Option<Checkpoint> = if let Some(path) = rest.first() {
                let mut bytes = Vec::new();
                File::open(path)?.take(4097).read_to_end(&mut bytes)?;
                if bytes.len() > 4096 { return Err("checkpoint exceeds size limit".into()); }
                Some(serde_json::from_slice(&bytes)?)
            } else { None };
            let checkpoint = audit::verify(BufReader::new(File::open(path)?), anchor.as_ref())?;
            if anchor.is_none() { eprintln!("Verified internal consistency only. Retain this checkpoint independently to detect future rewrites."); }
            println!("{}", serde_json::to_string(&checkpoint)?);
        }
        _ => return Err("Usage: mtl-audit check-db DATABASE | export DATABASE ACCOUNT_ID | verify EXPORT.jsonl [CHECKPOINT.json]".into()),
    }
    Ok(())
}
fn main() {
    if let Err(error) = run(&std::env::args().skip(1).collect::<Vec<_>>()) {
        eprintln!("Audit verification failed: {error}");
        std::process::exit(1);
    }
}
