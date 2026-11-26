use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use mtl_service::{AppState, INITIAL_CASH, now, router};
use serde_json::{Value, json};
use tower::ServiceExt;
use uuid::Uuid;

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    token: &str,
    body: Value,
) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header("Content-Type", "application/json");
    if !token.is_empty() {
        request = request.header("Authorization", format!("Bearer {token}"));
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| json!({"raw":String::from_utf8_lossy(&bytes)})),
    )
}
fn app() -> Router {
    router(AppState::open(":memory:", 100).unwrap())
}
async fn session(app: &Router) -> String {
    let (status, body) = call(app, "POST", "/api/v1/sessions", "", json!({})).await;
    assert_eq!(status, StatusCode::CREATED);
    body["token"].as_str().unwrap().into()
}
fn order(side: &str, quantity: u64, limit: u64) -> Value {
    json!({"symbol":"ECHO","side":side,"quantity":quantity,"limit_lamports":limit,"expires_at":now()+30,"idempotency_key":Uuid::new_v4().to_string()})
}
async fn account(app: &Router, token: &str) -> Value {
    let (status, result) = call(app, "GET", "/api/v1/account", token, Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    result
}
async fn trade(app: &Router, token: &str, side: &str, quantity: u64) {
    let (status, _) = call(
        app,
        "POST",
        "/api/v1/orders",
        token,
        order(side, quantity, if side == "buy" { INITIAL_CASH } else { 0 }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}
fn reconciles(account: &Value) {
    let p = &account["performance"];
    assert_eq!(p["history_complete"], true);
    assert_eq!(
        p["realized_pnl_lamports"].as_i64().unwrap()
            + p["unrealized_pnl_lamports"].as_i64().unwrap(),
        p["total_change_lamports"].as_i64().unwrap()
    );
    assert_eq!(
        account["cash_lamports"].as_u64().unwrap() + p["holdings_value_lamports"].as_u64().unwrap(),
        p["portfolio_value_lamports"].as_u64().unwrap()
    );
}

#[tokio::test]
async fn average_cost_includes_fees_and_survives_partial_sale_rebuy_and_full_exit() {
    let app = app();
    let token = session(&app).await;
    let empty = account(&app, &token).await;
    reconciles(&empty);
    assert_eq!(
        empty["performance"]["starting_balance_lamports"],
        INITIAL_CASH
    );
    assert_eq!(empty["performance"]["realized_pnl_lamports"], 0);
    trade(&app, &token, "buy", 10).await;
    let bought = account(&app, &token).await;
    reconciles(&bought);
    assert_eq!(bought["holdings"][0]["cost_basis_lamports"], 52_500_000);
    assert_eq!(bought["holdings"][0]["unrealized_pnl_lamports"], -5_000_000);
    trade(&app, &token, "sell", 4).await;
    let partial = account(&app, &token).await;
    reconciles(&partial);
    assert_eq!(partial["holdings"][0]["cost_basis_lamports"], 31_500_000);
    assert_eq!(partial["holdings"][0]["realized_pnl_lamports"], 9_400_000);
    trade(&app, &token, "buy", 2).await;
    let rebought = account(&app, &token).await;
    reconciles(&rebought);
    assert_eq!(rebought["holdings"][0]["cost_basis_lamports"], 46_200_000);
    assert_eq!(
        rebought["performance"]["unrealized_pnl_lamports"],
        -15_800_000
    );
    trade(&app, &token, "sell", 8).await;
    let exited = account(&app, &token).await;
    reconciles(&exited);
    assert_eq!(exited["holdings"], json!([]));
    assert_eq!(exited["performance"]["cost_basis_lamports"], 0);
    assert_eq!(exited["performance"]["realized_pnl_lamports"], -6_400_000);
    assert_eq!(exited["performance"]["unrealized_pnl_lamports"], 0);
    trade(&app, &token, "buy", 2).await;
    let new_position = account(&app, &token).await;
    reconciles(&new_position);
    assert_eq!(
        new_position["holdings"][0]["cost_basis_lamports"],
        2_100_000
    );
    assert_eq!(
        new_position["holdings"][0]["realized_pnl_lamports"],
        -6_400_000
    );
    trade(&app, &token, "sell", 2).await;
    let final_state = account(&app, &token).await;
    reconciles(&final_state);
    assert_eq!(
        final_state["performance"]["realized_pnl_lamports"],
        -6_600_000
    );
}

#[tokio::test]
async fn performance_uses_all_receipts_and_is_account_scoped() {
    let app = app();
    let token = session(&app).await;
    let other = session(&app).await;
    for _ in 0..60 {
        trade(&app, &token, "buy", 1).await;
        trade(&app, &token, "sell", 1).await;
    }
    trade(&app, &token, "buy", 2).await;
    let receipts = call(&app, "GET", "/api/v1/orders", &token, Value::Null)
        .await
        .1;
    assert_eq!(receipts["orders"].as_array().unwrap().len(), 100);
    let current = account(&app, &token).await;
    reconciles(&current);
    assert_eq!(current["performance"]["realized_pnl_lamports"], -3_000_000);
    assert_eq!(current["performance"]["unrealized_pnl_lamports"], -200_000);
    assert_eq!(current["performance"]["cost_basis_lamports"], 2_100_000);
    let untouched = account(&app, &other).await;
    reconciles(&untouched);
    assert_eq!(untouched["performance"]["total_change_lamports"], 0);
}

#[tokio::test]
async fn legacy_receipts_preserve_cost_basis_through_migration_and_restart() {
    use sha2::{Digest, Sha256};
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("exchange.db");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch(include_str!("../migrations/001.sql"))
        .unwrap();
    let token = "a".repeat(64);
    let hash = format!("{:x}", Sha256::digest(token.as_bytes()));
    db.execute(
        "INSERT INTO accounts VALUES('legacy',?1,99947500000,0)",
        [hash],
    )
    .unwrap();
    db.execute(
        "UPDATE markets SET supply=10,reserve=50000000 WHERE symbol='ECHO'",
        [],
    )
    .unwrap();
    db.execute("INSERT INTO holdings VALUES('legacy','ECHO',10)", [])
        .unwrap();
    db.execute("INSERT INTO trades VALUES('old-trade','legacy','old-key','{}','ECHO','buy',10,50000000,2500000,52500000,0)", []).unwrap();
    drop(db);
    let app = router(AppState::open(&path, 100).unwrap());
    let migrated = account(&app, &token).await;
    reconciles(&migrated);
    assert_eq!(migrated["holdings"][0]["cost_basis_lamports"], 52_500_000);
    trade(&app, &token, "sell", 4).await;
    let before_restart = account(&app, &token).await;
    drop(app);
    let reopened = router(AppState::open(&path, 100).unwrap());
    let after_restart = account(&reopened, &token).await;
    assert_eq!(before_restart, after_restart);
    reconciles(&after_restart);
    assert_eq!(
        after_restart["performance"]["realized_pnl_lamports"],
        9_400_000
    );
}
