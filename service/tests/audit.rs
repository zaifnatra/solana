use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use mtl_service::{
    AppState, INITIAL_CASH, Trade,
    audit::{self, Checkpoint, Page},
    now, router,
};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::{io::Cursor, path::Path, process::Command};
use tower::ServiceExt;

fn legacy(path: &Path, count: u64) {
    let db = Connection::open(path).unwrap();
    db.execute_batch(include_str!("../migrations/001.sql"))
        .unwrap();
    db.execute_batch(include_str!("../migrations/002.sql"))
        .unwrap();
    db.execute(
        "INSERT INTO accounts VALUES ('alice','hash',99999475000,1)",
        [],
    )
    .unwrap();
    db.execute(
        "INSERT INTO accounts VALUES ('empty','empty-hash',100000000000,1)",
        [],
    )
    .unwrap();
    for i in 1..=count {
        db.execute("INSERT INTO trades VALUES (?1,'alice',?1,'{}','ECHO','buy',1,500000,25000,525000,1700000000)", [format!("trade-{i}")]).unwrap();
    }
}
fn migrated(count: u64) -> (tempfile::TempDir, std::path::PathBuf, Connection) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("audit.sqlite3");
    legacy(&path, count);
    drop(AppState::open(&path, 100).unwrap());
    let db = Connection::open(&path).unwrap();
    (dir, path, db)
}
fn jsonl(pages: &[Page]) -> Vec<u8> {
    pages
        .iter()
        .map(|p| format!("{}\n", serde_json::to_string(p).unwrap()))
        .collect::<String>()
        .into_bytes()
}
fn verify(pages: &[Page], anchor: Option<&Checkpoint>) -> audit::AuditResult<Checkpoint> {
    audit::verify(Cursor::new(jsonl(pages)), anchor)
}
fn receipt() -> Trade {
    Trade {
        id: "trade-1".into(),
        symbol: "ECHO".into(),
        side: "buy".into(),
        quantity: 1,
        gross_lamports: 500000,
        fee_lamports: 25000,
        total_lamports: 525000,
        created_at: 1700000000,
    }
}
#[test]
fn hash_format_matches_independent_python_sha256_vector() {
    // Python hashlib + struct.pack('>Q', value), not the Rust encoder.
    let genesis = audit::genesis("alice");
    assert_eq!(
        genesis,
        "206380d5f90e8363fa1e16eb427eceb529be5a033fde953352e61a2667596946"
    );
    assert_eq!(
        audit::entry_hash("alice", 1, &genesis, &receipt()),
        "76ef309bc9523a01cc9cf9f2b179e560ab96c68970b50923d874fbe10e5bccdd"
    );
}
#[test]
fn migration_preserves_receipts_and_balances_and_restarts_deterministically() {
    let (_dir, path, db) = migrated(3);
    let head = audit::checkpoint(&db, "alice").unwrap();
    assert_eq!(head.sequence, 3);
    assert_eq!(
        db.query_row("SELECT cash FROM accounts WHERE id='alice'", [], |r| r
            .get::<_, u64>(0))
            .unwrap(),
        99999475000
    );
    let page = audit::page(&db, "alice", 0, 3).unwrap();
    assert_eq!(page.entries[0].trade.id, "trade-1");
    assert_eq!(page.entries[0].trade.total_lamports, 525000);
    assert_eq!(verify(&[page], None).unwrap(), head);
    drop(AppState::open(&path, 100).unwrap());
    assert_eq!(audit::checkpoint(&db, "alice").unwrap(), head);
    audit::check_database(&db).unwrap();
    let empty = audit::page(&db, "empty", 0, 0).unwrap();
    assert_eq!(verify(&[empty], None).unwrap().sequence, 0);
}
#[test]
fn pagination_retains_frozen_prefix_and_accepts_extension_of_saved_checkpoint() {
    let (_dir, _path, db) = migrated(503);
    let first = audit::page(&db, "alice", 0, 501).unwrap();
    let saved = first.checkpoint.clone();
    assert_eq!(first.entries.len(), 500);
    assert!(first.has_more);
    let last = audit::page(&db, "alice", 500, 501).unwrap();
    assert_eq!(last.entries.len(), 1);
    assert_eq!(verify(&[first, last], None).unwrap(), saved);
    let extended = [
        audit::page(&db, "alice", 0, 503).unwrap(),
        audit::page(&db, "alice", 500, 503).unwrap(),
    ];
    assert_eq!(verify(&extended, Some(&saved)).unwrap().sequence, 503);
    assert!(verify(&extended[..1], None).is_err());
    assert!(verify(&[audit::page(&db, "alice", 0, 500).unwrap()], Some(&saved)).is_err());
}
#[test]
fn verifier_rejects_tampering_ordering_gaps_and_invalid_boundaries() {
    let (_dir, _path, db) = migrated(3);
    for mutation in 0..9 {
        let mut page = audit::page(&db, "alice", 0, 3).unwrap();
        match mutation {
            0 => page.entries[0].trade.quantity += 1,
            1 => page.entries.swap(0, 1),
            2 => {
                page.entries.remove(1);
            }
            3 => page.checkpoint.version = 2,
            4 => page.checkpoint.account_id = "bob".into(),
            5 => page.next_after = 2,
            6 => page.has_more = true,
            7 => page.entries[1].previous_hash = "0".repeat(64),
            _ => page.checkpoint.hash = "f".repeat(64),
        }
        assert!(verify(&[page], None).is_err(), "mutation {mutation}");
    }
    let page = audit::page(&db, "alice", 0, 3).unwrap();
    let mut bytes = jsonl(&[page]);
    let duplicate = bytes.clone();
    bytes.extend(duplicate);
    assert!(audit::verify(Cursor::new(bytes), None).is_err());
    assert!(audit::verify(Cursor::new(Vec::<u8>::new()), None).is_err());
    assert!(audit::verify(Cursor::new(vec![b' '; 2 * 1024 * 1024 + 1]), None).is_err());
}
#[test]
fn retained_checkpoint_detects_complete_rehash_of_changed_history() {
    let (_dir, _path, db) = migrated(3);
    let mut page = audit::page(&db, "alice", 0, 3).unwrap();
    let trusted = page.checkpoint.clone();
    page.entries[0].trade.quantity = 9;
    let mut previous = audit::genesis("alice");
    for entry in &mut page.entries {
        entry.previous_hash = previous.clone();
        entry.hash = audit::entry_hash("alice", entry.sequence, &previous, &entry.trade);
        previous = entry.hash.clone();
    }
    page.checkpoint.hash = previous;
    assert!(verify(&[audit::page(&db, "empty", 0, 0).unwrap()], Some(&trusted)).is_err());
    // Self-consistent replacement passes without an independent anchor; this is
    // deliberately not described as an immutable or decentralized blockchain.
    assert!(verify(std::slice::from_ref(&page), None).is_ok());
    assert!(verify(&[page], Some(&trusted)).is_err());
}
#[test]
fn append_only_guards_and_startup_detect_receipt_damage() {
    let (_dir, path, db) = migrated(2);
    assert!(
        db.execute("UPDATE trade_audit SET entry_hash=?1", ["0".repeat(64)])
            .is_err()
    );
    assert!(db.execute("DELETE FROM trade_audit", []).is_err());
    db.execute("UPDATE trades SET quantity=2 WHERE id='trade-1'", [])
        .unwrap();
    assert!(audit::check_database(&db).is_err());
    assert!(AppState::open(&path, 100).is_err());
}
#[test]
fn missing_receipt_and_schema_newer_than_service_are_rejected() {
    let (_dir, path, db) = migrated(2);
    db.execute_batch("PRAGMA foreign_keys=OFF").unwrap();
    db.execute("DELETE FROM trades WHERE id='trade-1'", [])
        .unwrap();
    assert!(audit::check_database(&db).is_err());
    db.execute_batch("PRAGMA user_version=4").unwrap();
    assert!(AppState::open(path, 100).is_err());
}
#[test]
fn cli_exports_verifies_and_checks_database_without_migration() {
    let (dir, path, db) = migrated(2);
    let tool = env!("CARGO_BIN_EXE_mtl-audit");
    let run = |args: &[&str]| Command::new(tool).args(args).output().unwrap();
    let path = path.to_str().unwrap();
    assert!(run(&["check-db", path]).status.success());
    let export = run(&["export", path, "alice"]);
    assert!(export.status.success());
    let exported = String::from_utf8(export.stdout.clone()).unwrap();
    assert!(
        !exported.contains("token_hash")
            && !exported.contains("idempotency_key")
            && !exported.contains("request_json")
    );
    let file = dir.path().join("export.jsonl");
    std::fs::write(&file, export.stdout).unwrap();
    let file = file.to_str().unwrap();
    let verified = run(&["verify", file]);
    assert!(verified.status.success());
    let checkpoint = dir.path().join("checkpoint.json");
    std::fs::write(&checkpoint, verified.stdout).unwrap();
    assert!(
        run(&["verify", file, checkpoint.to_str().unwrap()])
            .status
            .success()
    );
    db.execute("UPDATE trades SET quantity=2 WHERE id='trade-1'", [])
        .unwrap();
    assert!(!run(&["check-db", path]).status.success());
    let old = dir.path().join("old.sqlite3");
    legacy(&old, 1);
    assert!(!run(&["check-db", old.to_str().unwrap()]).status.success());
    let olddb = Connection::open(old).unwrap();
    assert_eq!(
        olddb
            .query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
            .unwrap(),
        2
    );
}
async fn call(
    app: &Router,
    method: &str,
    path: &str,
    token: &str,
    body: Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Bearer {token}"))
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}
async fn session(app: &Router) -> String {
    call(app, "POST", "/api/v1/sessions", "", json!({})).await.1["token"]
        .as_str()
        .unwrap()
        .into()
}
fn order() -> Value {
    json!({"symbol":"ECHO","side":"buy","quantity":1,"limit_lamports":INITIAL_CASH,"expires_at":now()+30,"idempotency_key":"00000000-0000-4000-8000-000000000001"})
}
#[tokio::test]
async fn api_is_account_scoped_retry_safe_and_keeps_export_boundary_frozen() {
    let app = router(AppState::open(":memory:", 100).unwrap());
    let alice = session(&app).await;
    let bob = session(&app).await;
    let request = order();
    let first = call(&app, "POST", "/api/v1/orders", &alice, request.clone()).await;
    assert_eq!(first.0, StatusCode::OK);
    assert_eq!(
        first,
        call(&app, "POST", "/api/v1/orders", &alice, request).await
    );
    let (status, page) = call(&app, "GET", "/api/v1/audit", &alice, Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["checkpoint"]["sequence"], 1);
    let frozen = page.clone();
    let mut next = order();
    next["idempotency_key"] = json!("00000000-0000-4000-8000-000000000002");
    assert_eq!(
        call(&app, "POST", "/api/v1/orders", &alice, next).await.0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, "GET", "/api/v1/audit?through=1", &alice, Value::Null)
            .await
            .1,
        frozen
    );
    assert_eq!(
        call(&app, "GET", "/api/v1/audit", &bob, Value::Null)
            .await
            .1["checkpoint"]["sequence"],
        0
    );
    assert_eq!(
        call(&app, "GET", "/api/v1/audit", "", Value::Null).await.0,
        StatusCode::UNAUTHORIZED
    );
    for query in ["after=3", "through=3", "after=2&through=1"] {
        assert_eq!(
            call(
                &app,
                "GET",
                &format!("/api/v1/audit?{query}"),
                &alice,
                Value::Null
            )
            .await
            .0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
    verify(&[serde_json::from_value(page).unwrap()], None).unwrap();
}
#[tokio::test]
async fn audit_write_failure_rolls_back_all_settlement_state() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.sqlite3");
    let app = router(AppState::open(&path, 100).unwrap());
    let token = session(&app).await;
    let db = Connection::open(&path).unwrap();
    db.execute_batch("CREATE TRIGGER fail_audit BEFORE INSERT ON trade_audit BEGIN SELECT RAISE(ABORT,'injected failure'); END;").unwrap();
    assert_eq!(
        call(&app, "POST", "/api/v1/orders", &token, order())
            .await
            .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
        db.query_row("SELECT cash FROM accounts", [], |r| r.get::<_, u64>(0))
            .unwrap(),
        INITIAL_CASH
    );
    for table in ["trades", "trade_audit", "holdings"] {
        assert_eq!(
            db.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r
                .get::<_, u64>(0))
                .unwrap(),
            0
        );
    }
    assert_eq!(
        db.query_row(
            "SELECT supply+reserve FROM markets WHERE symbol=?1",
            params!["ECHO"],
            |r| r.get::<_, u64>(0)
        )
        .unwrap(),
        0
    );
    db.execute_batch("DROP TRIGGER fail_audit").unwrap();
    assert_eq!(
        call(&app, "POST", "/api/v1/orders", &token, order())
            .await
            .0,
        StatusCode::OK
    );
    audit::check_database(&db).unwrap();
}
