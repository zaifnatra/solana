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
async fn cash(app: &Router, token: &str) -> u64 {
    call(app, "GET", "/api/v1/account", token, Value::Null)
        .await
        .1["cash_lamports"]
        .as_u64()
        .unwrap()
}

#[tokio::test]
async fn round_trip_conserves_cash_reserve_and_fees() {
    let app = app();
    let token = session(&app).await;
    let (status, buy) = call(
        &app,
        "POST",
        "/api/v1/orders",
        &token,
        order("buy", 10, INITIAL_CASH),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(buy["total_lamports"], 52_500_000);
    let (status, sell) = call(&app, "POST", "/api/v1/orders", &token, order("sell", 10, 0)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(sell["total_lamports"], 47_500_000);
    assert_eq!(cash(&app, &token).await, INITIAL_CASH - 5_000_000);
    let markets = call(&app, "GET", "/api/v1/markets", "", Value::Null)
        .await
        .1;
    assert_eq!(
        markets["markets"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["symbol"] == "ECHO")
            .unwrap()["supply"],
        0
    );
    assert_eq!(
        markets["markets"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["symbol"] == "ECHO")
            .unwrap()["reserve_lamports"],
        0
    );
}

#[tokio::test]
async fn retries_execute_once_and_mismatched_keys_conflict() {
    let app = app();
    let token = session(&app).await;
    let request = order("buy", 10, INITIAL_CASH);
    let first = call(&app, "POST", "/api/v1/orders", &token, request.clone()).await;
    let second = call(&app, "POST", "/api/v1/orders", &token, request.clone()).await;
    assert_eq!(first, second);
    let mut changed = request;
    changed["quantity"] = json!(20);
    assert_eq!(
        call(&app, "POST", "/api/v1/orders", &token, changed)
            .await
            .0,
        StatusCode::CONFLICT
    );
    assert_eq!(cash(&app, &token).await, INITIAL_CASH - 52_500_000);
    let history = call(&app, "GET", "/api/v1/orders", &token, Value::Null)
        .await
        .1;
    assert_eq!(history["orders"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn insufficient_funds_and_tokens_roll_back_everything() {
    let app = app();
    let alice = session(&app).await;
    let bob = session(&app).await;
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/orders",
            &alice,
            order("buy", 1000, u64::MAX)
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(cash(&app, &alice).await, INITIAL_CASH);
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/orders",
            &bob,
            order("buy", 10, INITIAL_CASH)
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, "POST", "/api/v1/orders", &alice, order("sell", 1, 0))
            .await
            .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(cash(&app, &alice).await, INITIAL_CASH);
    let markets = call(&app, "GET", "/api/v1/markets", "", Value::Null)
        .await
        .1;
    assert_eq!(
        markets["markets"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["symbol"] == "ECHO")
            .unwrap()["supply"],
        10
    );
    assert_eq!(
        markets["markets"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["symbol"] == "ECHO")
            .unwrap()["reserve_lamports"],
        50_000_000
    );
}

#[tokio::test]
async fn rejects_stale_quotes_and_adverse_price_movement() {
    let app = app();
    let alice = session(&app).await;
    let bob = session(&app).await;
    let quote = call(
        &app,
        "POST",
        "/api/v1/quotes",
        &alice,
        json!({"symbol":"ECHO","side":"buy","quantity":10}),
    )
    .await
    .1;
    call(
        &app,
        "POST",
        "/api/v1/orders",
        &bob,
        order("buy", 10, INITIAL_CASH),
    )
    .await;
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/orders",
            &alice,
            order("buy", 10, quote["total_lamports"].as_u64().unwrap())
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let mut expired = order("buy", 1, INITIAL_CASH);
    expired["expires_at"] = json!(now() - 1);
    assert_eq!(
        call(&app, "POST", "/api/v1/orders", &alice, expired)
            .await
            .0,
        StatusCode::CONFLICT
    );
    let mut future = order("buy", 1, INITIAL_CASH);
    future["expires_at"] = json!(now() + 3600);
    assert_eq!(
        call(&app, "POST", "/api/v1/orders", &alice, future).await.0,
        StatusCode::CONFLICT
    );
    assert_eq!(cash(&app, &alice).await, INITIAL_CASH);
}

#[tokio::test]
async fn sell_minimum_includes_fees_and_is_enforced() {
    let app = app();
    let token = session(&app).await;
    call(
        &app,
        "POST",
        "/api/v1/orders",
        &token,
        order("buy", 10, INITIAL_CASH),
    )
    .await;
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/orders",
            &token,
            order("sell", 10, 50_000_000)
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(cash(&app, &token).await, INITIAL_CASH - 52_500_000);
}

#[tokio::test]
async fn concurrent_duplicate_requests_return_one_trade() {
    let app = app();
    let token = session(&app).await;
    let request = order("buy", 10, INITIAL_CASH);
    let (a, b) = tokio::join!(
        call(&app, "POST", "/api/v1/orders", &token, request.clone()),
        call(&app, "POST", "/api/v1/orders", &token, request)
    );
    assert_eq!(a, b);
    assert_eq!(a.0, StatusCode::OK);
    assert_eq!(cash(&app, &token).await, INITIAL_CASH - 52_500_000);
}

#[tokio::test]
async fn concurrent_buyers_cannot_both_use_a_stale_price() {
    let app = app();
    let a = session(&app).await;
    let b = session(&app).await;
    let (a, b) = tokio::join!(
        call(
            &app,
            "POST",
            "/api/v1/orders",
            &a,
            order("buy", 10, 52_500_000)
        ),
        call(
            &app,
            "POST",
            "/api/v1/orders",
            &b,
            order("buy", 10, 52_500_000)
        )
    );
    assert!(
        (a.0 == StatusCode::OK && b.0 == StatusCode::CONFLICT)
            || (b.0 == StatusCode::OK && a.0 == StatusCode::CONFLICT)
    );
}

#[tokio::test]
async fn authentication_and_account_isolation() {
    let app = app();
    let alice = session(&app).await;
    let bob = session(&app).await;
    for token in ["", "bad", &"a".repeat(64)] {
        assert_eq!(
            call(&app, "GET", "/api/v1/account", token, Value::Null)
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call(
                &app,
                "POST",
                "/api/v1/orders",
                token,
                order("buy", 1, INITIAL_CASH)
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
    }
    call(
        &app,
        "POST",
        "/api/v1/orders",
        &alice,
        order("buy", 1, INITIAL_CASH),
    )
    .await;
    assert_eq!(cash(&app, &bob).await, INITIAL_CASH);
    assert_eq!(
        call(&app, "GET", "/api/v1/orders", &bob, Value::Null)
            .await
            .1["orders"],
        json!([])
    );
}

#[tokio::test]
async fn rejects_invalid_quantities_markets_and_keys() {
    let app = app();
    let token = session(&app).await;
    for quantity in [0, 10001, u64::MAX] {
        assert_eq!(
            call(
                &app,
                "POST",
                "/api/v1/orders",
                &token,
                order("buy", quantity, INITIAL_CASH)
            )
            .await
            .0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
    let mut unknown = order("buy", 1, INITIAL_CASH);
    unknown["symbol"] = json!("UNKNOWN");
    assert_eq!(
        call(&app, "POST", "/api/v1/orders", &token, unknown)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    let mut bad_key = order("buy", 1, INITIAL_CASH);
    bad_key["idempotency_key"] = json!("bad");
    assert_eq!(
        call(&app, "POST", "/api/v1/orders", &token, bad_key)
            .await
            .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let mut fractional = order("buy", 1, INITIAL_CASH);
    fractional["quantity"] = json!(1.5);
    assert_eq!(
        call(&app, "POST", "/api/v1/orders", &token, fractional)
            .await
            .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
}

#[tokio::test]
async fn persists_accounts_balances_and_idempotency_across_restart() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("exchange.db");
    let app = router(AppState::open(&path, 100).unwrap());
    let token = session(&app).await;
    let request = order("buy", 10, INITIAL_CASH);
    let first = call(&app, "POST", "/api/v1/orders", &token, request.clone()).await;
    drop(app);
    let reopened = router(AppState::open(&path, 100).unwrap());
    assert_eq!(cash(&reopened, &token).await, INITIAL_CASH - 52_500_000);
    assert_eq!(
        call(&reopened, "POST", "/api/v1/orders", &token, request).await,
        first
    );
}

#[tokio::test]
async fn bounded_accounts_and_health() {
    let app = router(AppState::open(":memory:", 1).unwrap());
    session(&app).await;
    assert_eq!(
        call(&app, "POST", "/api/v1/sessions", "", json!({}))
            .await
            .0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        call(&app, "GET", "/readyz", "", Value::Null).await.0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, "GET", "/api/v1/missing", "", Value::Null)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn many_trades_conserve_all_paper_money_and_supply() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("exchange.db");
    let app = router(AppState::open(&path, 100).unwrap());
    let mut tokens = Vec::new();
    for _ in 0..5 {
        tokens.push(session(&app).await);
    }
    // Deterministic mixed flow across independent accounts, followed by a full unwind.
    for quantity in 1..=20 {
        for token in &tokens {
            assert_eq!(
                call(
                    &app,
                    "POST",
                    "/api/v1/orders",
                    token,
                    order("buy", quantity, INITIAL_CASH)
                )
                .await
                .0,
                StatusCode::OK
            );
            assert_eq!(
                call(
                    &app,
                    "POST",
                    "/api/v1/orders",
                    token,
                    order("sell", quantity, 0)
                )
                .await
                .0,
                StatusCode::OK
            );
        }
    }
    let db = rusqlite::Connection::open(path).unwrap();
    let cash: u64 = db
        .query_row("SELECT SUM(cash) FROM accounts", [], |r| r.get(0))
        .unwrap();
    let reserve: u64 = db
        .query_row("SELECT SUM(reserve) FROM markets", [], |r| r.get(0))
        .unwrap();
    let fees: u64 = db
        .query_row("SELECT SUM(fee_lamports) FROM trades", [], |r| r.get(0))
        .unwrap();
    assert_eq!(cash + reserve + fees, 5 * INITIAL_CASH);
    assert_eq!(reserve, 0);
    let supply: u64 = db
        .query_row("SELECT SUM(supply) FROM markets", [], |r| r.get(0))
        .unwrap();
    let holdings: u64 = db
        .query_row("SELECT SUM(quantity) FROM holdings", [], |r| r.get(0))
        .unwrap();
    assert_eq!(supply, holdings);
    assert_eq!(supply, 0);
}

#[tokio::test]
async fn ledger_failure_rolls_back_all_balance_updates() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("exchange.db");
    let app = router(AppState::open(&path, 100).unwrap());
    let token = session(&app).await;
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch("CREATE TRIGGER fail_receipt BEFORE INSERT ON trades BEGIN SELECT RAISE(ABORT, 'simulated ledger failure'); END;").unwrap();
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/orders",
            &token,
            order("buy", 10, INITIAL_CASH)
        )
        .await
        .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(cash(&app, &token).await, INITIAL_CASH);
    let holdings: u64 = db
        .query_row("SELECT COUNT(*) FROM holdings", [], |r| r.get(0))
        .unwrap();
    let supply: u64 = db
        .query_row("SELECT SUM(supply) FROM markets", [], |r| r.get(0))
        .unwrap();
    let reserve: u64 = db
        .query_row("SELECT SUM(reserve) FROM markets", [], |r| r.get(0))
        .unwrap();
    assert_eq!((holdings, supply, reserve), (0, 0, 0));
}

#[tokio::test]
async fn committed_receipt_can_be_retrieved_after_deadline() {
    let app = app();
    let token = session(&app).await;
    let mut request = order("buy", 1, INITIAL_CASH);
    request["expires_at"] = json!(now() + 2);
    let first = call(&app, "POST", "/api/v1/orders", &token, request.clone()).await;
    assert_eq!(first.0, StatusCode::OK);
    std::thread::sleep(std::time::Duration::from_secs(3));
    assert_eq!(
        call(&app, "POST", "/api/v1/orders", &token, request).await,
        first
    );
}
