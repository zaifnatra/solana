//! Persistent paper exchange. No private keys, RPC calls, or real funds.
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Semaphore;
use tower_http::trace::TraceLayer;
use uuid::Uuid;

// Compile the same pure Rust math as the Anchor program; there is no second curve implementation.
#[path = "../../engine/programs/sol_proj/src/curve.rs"]
#[rustfmt::skip]
pub mod curve;
mod artists;

pub const INITIAL_CASH: u64 = 100_000_000_000;
pub const MAX_SUPPLY: u64 = 100_000;
pub const MAX_ORDER: u64 = 10_000;

#[derive(Clone)]
pub struct AppState {
    db: Arc<Mutex<Connection>>,
    capacity: Arc<Semaphore>,
    max_accounts: u64,
    signup_window: Arc<Mutex<(Instant, u32)>>,
}

#[derive(Debug)]
pub struct ApiError(StatusCode, &'static str);
type Result<T> = std::result::Result<T, ApiError>;

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut response = (self.0, Json(json!({"error": self.1}))).into_response();
        if self.0 == StatusCode::TOO_MANY_REQUESTS {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, "60".parse().unwrap());
        }
        response
    }
}
impl From<rusqlite::Error> for ApiError {
    fn from(error: rusqlite::Error) -> Self {
        tracing::error!(%error, "database operation failed");
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Storage operation failed",
        )
    }
}
fn invalid(message: &'static str) -> ApiError {
    ApiError(StatusCode::UNPROCESSABLE_ENTITY, message)
}
fn conflict(message: &'static str) -> ApiError {
    ApiError(StatusCode::CONFLICT, message)
}
fn internal() -> ApiError {
    ApiError(StatusCode::INTERNAL_SERVER_ERROR, "Service unavailable")
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock before epoch")
        .as_secs()
}

impl AppState {
    pub fn open(path: impl AsRef<Path>, max_accounts: u64) -> Result<Self> {
        if !(1..=10_000).contains(&max_accounts) {
            return Err(invalid("Account cap must be between 1 and 10000"));
        }
        let mut db = Connection::open(path)?;
        db.busy_timeout(Duration::from_secs(5))?;
        db.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;",
        )?;
        let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let version: u32 = tx.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > 2 {
            return Err(invalid("Database schema is newer than this service"));
        }
        if version < 1 {
            tx.execute_batch(include_str!("../migrations/001.sql"))?;
        }
        if version < 2 {
            tx.execute_batch(include_str!("../migrations/002.sql"))?;
        }
        tx.commit()?;
        Ok(Self {
            db: Arc::new(Mutex::new(db)),
            capacity: Arc::new(Semaphore::new(64)),
            max_accounts,
            signup_window: Arc::new(Mutex::new((Instant::now(), 0))),
        })
    }

    async fn run<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Connection) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        // SQLite work never blocks a Tokio executor thread. A bounded queue prevents overload.
        let permit = self.capacity.clone().try_acquire_owned().map_err(|_| {
            ApiError(
                StatusCode::SERVICE_UNAVAILABLE,
                "Service busy; retry shortly",
            )
        })?;
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let mut connection = db.lock().map_err(|_| internal())?;
            f(&mut connection)
        })
        .await
        .map_err(|_| internal())?
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route(
            "/healthz",
            get(|| async { Json(json!({"status":"ok", "mode":"paper"})) }),
        )
        .route("/readyz", get(ready))
        .route("/metrics", get(metrics))
        .route(
            "/api/v1/artists",
            get(artists::list).post(artists::register),
        )
        .route("/api/v1/artists/{symbol}", get(artists::detail))
        .route(
            "/api/v1/artists/{symbol}/follow",
            axum::routing::put(artists::follow),
        )
        .route("/api/v1/artists/{symbol}/releases", post(artists::publish))
        .route(
            "/api/v1/profile",
            get(artists::profile).put(artists::save_profile),
        )
        .route("/api/v1/feed", get(artists::feed))
        .route("/api/v1/markets", get(markets))
        .route("/api/v1/sessions", post(create_session))
        .route("/api/v1/account", get(account))
        .route("/api/v1/quotes", post(quote))
        .route("/api/v1/orders", post(order).get(orders))
        .route(
            "/api/{*path}",
            get(|| async { ApiError(StatusCode::NOT_FOUND, "Unknown API endpoint") }),
        )
        .layer(DefaultBodyLimit::max(16 * 1024))
        .layer(middleware::from_fn(response_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn response_headers(request: axum::extract::Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
        .headers_mut()
        .insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse().unwrap());
    response
}

fn token_hash(headers: &HeaderMap) -> Result<String> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or(ApiError(
            StatusCode::UNAUTHORIZED,
            "Create a paper account to continue",
        ))?;
    Ok(format!("{:x}", Sha256::digest(token.as_bytes())))
}
fn authenticate(db: &Connection, hash: &str) -> Result<(String, u64)> {
    db.query_row(
        "SELECT id, cash FROM accounts WHERE token_hash=?1",
        [hash],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .optional()?
    .ok_or(ApiError(
        StatusCode::UNAUTHORIZED,
        "Paper account no longer exists",
    ))
}
async fn ready(State(state): State<AppState>) -> Result<Json<Value>> {
    state
        .run(|db| {
            db.query_row("SELECT COUNT(*) FROM markets", [], |r| r.get::<_, u64>(0))?;
            Ok(())
        })
        .await?;
    Ok(Json(json!({"status":"ready", "mode":"paper"})))
}
async fn create_session(State(state): State<AppState>) -> Result<(StatusCode, Json<Value>)> {
    // A global admission limit bounds anonymous signup even behind a proxy.
    // Forwarded IP headers are never trusted. Ingress may add stricter per-client limits.
    {
        let mut window = state.signup_window.lock().map_err(|_| internal())?;
        if window.0.elapsed() >= Duration::from_secs(60) {
            *window = (Instant::now(), 0);
        }
        if window.1 >= 30 {
            return Err(ApiError(
                StatusCode::TOO_MANY_REQUESTS,
                "Account creation is busy; retry in one minute",
            ));
        }
        window.1 += 1;
    }
    let cap = state.max_accounts;
    state
        .run(move |db| {
            let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let count: u64 = tx.query_row("SELECT COUNT(*) FROM accounts", [], |r| r.get(0))?;
            if count >= cap {
                return Err(ApiError(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Paper account capacity reached",
                ));
            }
            let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
            let hash = format!("{:x}", Sha256::digest(token.as_bytes()));
            let id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO accounts(id,token_hash,cash,created_at) VALUES(?1,?2,?3,?4)",
                params![id, hash, INITIAL_CASH, now()],
            )?;
            tx.execute("INSERT INTO profiles(account_id) VALUES(?1)", [&id])?;
            tx.commit()?;
            Ok((
                StatusCode::CREATED,
                Json(json!({"token":token, "cash_lamports":INITIAL_CASH, "mode":"paper"})),
            ))
        })
        .await
}

#[derive(Serialize)]
struct Market {
    symbol: String,
    name: String,
    genre: String,
    supply: u64,
    reserve_lamports: u64,
    next_token_lamports: u64,
}
async fn markets(State(state): State<AppState>) -> Result<Json<Value>> {
    state
        .run(|db| {
            let mut stmt =
                db.prepare("SELECT symbol,name,genre,supply,reserve FROM markets ORDER BY symbol")?;
            let rows = stmt
                .query_map([], |r| {
                    let supply = r.get(3)?;
                    Ok(Market {
                        symbol: r.get(0)?,
                        name: r.get(1)?,
                        genre: r.get(2)?,
                        supply,
                        reserve_lamports: r.get(4)?,
                        next_token_lamports: curve::buy_cost(supply, 1).unwrap(),
                    })
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(Json(
                json!({"markets":rows, "mode":"paper", "fee_bps":curve::FEE_BPS}),
            ))
        })
        .await
}
async fn account(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>> {
    let hash = token_hash(&headers)?;
    state.run(move |db| {
        let (id,cash) = authenticate(db,&hash)?;
        let mut stmt = db.prepare("SELECT h.symbol,h.quantity,m.supply FROM holdings h JOIN markets m USING(symbol) WHERE account_id=?1 AND quantity>0 ORDER BY h.symbol")?;
        let holdings = stmt.query_map([id], |r| {
            let quantity: u64 = r.get(1)?;
            let gross = curve::sell_refund(r.get(2)?,quantity).unwrap();
            Ok(json!({"symbol":r.get::<_,String>(0)?, "quantity":quantity, "liquidation_lamports":gross-curve::fee(gross)}))
        })?.collect::<std::result::Result<Vec<_>,_>>()?;
        Ok(Json(json!({"cash_lamports":cash, "holdings":holdings, "mode":"paper"})))
    }).await
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Buy,
    Sell,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct QuoteRequest {
    pub symbol: String,
    pub side: Side,
    pub quantity: u64,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct Quote {
    pub symbol: String,
    pub side: Side,
    pub quantity: u64,
    pub gross_lamports: u64,
    pub fee_lamports: u64,
    pub total_lamports: u64,
    pub expires_at: u64,
}
fn price(db: &Connection, request: &QuoteRequest) -> Result<Quote> {
    if request.quantity == 0 || request.quantity > MAX_ORDER {
        return Err(invalid("Quantity must be between 1 and 10000 whole tokens"));
    }
    let supply: u64 = db
        .query_row(
            "SELECT supply FROM markets WHERE symbol=?1",
            [&request.symbol],
            |r| r.get(0),
        )
        .optional()?
        .ok_or(ApiError(StatusCode::NOT_FOUND, "Market not found"))?;
    let gross = match request.side {
        Side::Buy => {
            if supply + request.quantity > MAX_SUPPLY {
                return Err(invalid("Market supply limit reached"));
            }
            curve::buy_cost(supply, request.quantity)
        }
        Side::Sell => curve::sell_refund(supply, request.quantity),
    }
    .ok_or(invalid("Quantity exceeds market supply"))?;
    let fee = curve::fee(gross);
    Ok(Quote {
        symbol: request.symbol.clone(),
        side: request.side.clone(),
        quantity: request.quantity,
        gross_lamports: gross,
        fee_lamports: fee,
        total_lamports: match request.side {
            Side::Buy => gross + fee,
            Side::Sell => gross - fee,
        },
        expires_at: now() + 30,
    })
}
async fn quote(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<QuoteRequest>,
) -> Result<Json<Quote>> {
    let hash = token_hash(&headers)?;
    state
        .run(move |db| {
            authenticate(db, &hash)?;
            Ok(Json(price(db, &request)?))
        })
        .await
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct OrderRequest {
    pub symbol: String,
    pub side: Side,
    pub quantity: u64,
    /// Maximum total debit for a buy, minimum net credit for a sell.
    pub limit_lamports: u64,
    pub expires_at: u64,
    pub idempotency_key: String,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct Trade {
    pub id: String,
    pub symbol: String,
    pub side: String,
    pub quantity: u64,
    pub gross_lamports: u64,
    pub fee_lamports: u64,
    pub total_lamports: u64,
    pub created_at: u64,
}
fn trade_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Trade> {
    Ok(Trade {
        id: r.get(0)?,
        symbol: r.get(1)?,
        side: r.get(2)?,
        quantity: r.get(3)?,
        gross_lamports: r.get(4)?,
        fee_lamports: r.get(5)?,
        total_lamports: r.get(6)?,
        created_at: r.get(7)?,
    })
}
const TRADE_COLUMNS: &str =
    "id,symbol,side,quantity,gross_lamports,fee_lamports,total_lamports,created_at";
async fn order(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<OrderRequest>,
) -> Result<Json<Trade>> {
    let hash = token_hash(&headers)?;
    state
        .run(move |db| execute(db, &hash, request).map(Json))
        .await
}
fn execute(db: &mut Connection, hash: &str, request: OrderRequest) -> Result<Trade> {
    if Uuid::parse_str(&request.idempotency_key).is_err() {
        return Err(invalid("Idempotency key must be a UUID"));
    }
    let serialized = serde_json::to_string(&request).map_err(|_| internal())?;
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let (account_id, cash) = authenticate(&tx, hash)?;
    let existing: Option<String> = tx
        .query_row(
            "SELECT request_json FROM trades WHERE account_id=?1 AND idempotency_key=?2",
            params![account_id, request.idempotency_key],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(original) = existing {
        if original != serialized {
            return Err(conflict(
                "Idempotency key already used for a different order",
            ));
        }
        // A retry remains valid after the quote expires; it returns the committed receipt.
        return Ok(tx.query_row(
            &format!(
                "SELECT {TRADE_COLUMNS} FROM trades WHERE account_id=?1 AND idempotency_key=?2"
            ),
            params![account_id, request.idempotency_key],
            trade_row,
        )?);
    }
    let timestamp = now();
    if request.expires_at <= timestamp || request.expires_at > timestamp + 60 {
        return Err(conflict("Quote expired; request a fresh quote"));
    }
    let quote = price(
        &tx,
        &QuoteRequest {
            symbol: request.symbol.clone(),
            side: request.side.clone(),
            quantity: request.quantity,
        },
    )?;
    let holding: u64 = tx
        .query_row(
            "SELECT quantity FROM holdings WHERE account_id=?1 AND symbol=?2",
            params![account_id, request.symbol],
            |r| r.get(0),
        )
        .optional()?
        .unwrap_or(0);
    let (new_cash, new_holding, delta) = match request.side {
        Side::Buy => {
            if quote.total_lamports > request.limit_lamports {
                return Err(conflict("Price moved above your limit; refresh the quote"));
            }
            if cash < quote.total_lamports {
                return Err(invalid("Insufficient paper SOL"));
            }
            (
                cash - quote.total_lamports,
                holding + request.quantity,
                1_i64,
            )
        }
        Side::Sell => {
            if quote.total_lamports < request.limit_lamports {
                return Err(conflict("Price moved below your limit; refresh the quote"));
            }
            if holding < request.quantity {
                return Err(invalid("Insufficient token balance"));
            }
            (
                cash.checked_add(quote.total_lamports)
                    .ok_or_else(internal)?,
                holding - request.quantity,
                -1_i64,
            )
        }
    };
    tx.execute(
        "UPDATE accounts SET cash=?1 WHERE id=?2",
        params![new_cash, account_id],
    )?;
    tx.execute("INSERT INTO holdings(account_id,symbol,quantity) VALUES(?1,?2,?3) ON CONFLICT(account_id,symbol) DO UPDATE SET quantity=excluded.quantity",
        params![account_id,request.symbol,new_holding])?;
    tx.execute(
        "UPDATE markets SET supply=supply+?1,reserve=reserve+?2 WHERE symbol=?3",
        params![
            delta * request.quantity as i64,
            delta * quote.gross_lamports as i64,
            request.symbol
        ],
    )?;
    let trade = Trade {
        id: Uuid::new_v4().to_string(),
        symbol: request.symbol,
        side: match request.side {
            Side::Buy => "buy",
            Side::Sell => "sell",
        }
        .into(),
        quantity: request.quantity,
        gross_lamports: quote.gross_lamports,
        fee_lamports: quote.fee_lamports,
        total_lamports: quote.total_lamports,
        created_at: timestamp,
    };
    tx.execute("INSERT INTO trades(id,account_id,idempotency_key,request_json,symbol,side,quantity,gross_lamports,fee_lamports,total_lamports,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![trade.id,account_id,request.idempotency_key,serialized,trade.symbol,trade.side,trade.quantity,trade.gross_lamports,trade.fee_lamports,trade.total_lamports,trade.created_at])?;
    tx.commit()?;
    Ok(trade)
}
async fn orders(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>> {
    let hash = token_hash(&headers)?;
    state.run(move |db| {
        let (id,_) = authenticate(db,&hash)?;
        let mut stmt = db.prepare(&format!("SELECT {TRADE_COLUMNS} FROM trades WHERE account_id=?1 ORDER BY rowid DESC LIMIT 100"))?;
        let trades = stmt.query_map([id],trade_row)?.collect::<std::result::Result<Vec<_>,_>>()?;
        Ok(Json(json!({"orders":trades})))
    }).await
}

async fn metrics(State(state): State<AppState>) -> Result<impl IntoResponse> {
    let snapshot = state.run(|db| {
        let accounts: u64 = db.query_row("SELECT COUNT(*) FROM accounts", [], |r| r.get(0))?;
        let markets: u64 = db.query_row("SELECT COUNT(*) FROM markets", [], |r| r.get(0))?;
        let trades: u64 = db.query_row("SELECT COUNT(*) FROM trades", [], |r| r.get(0))?;
        let reserves: u64 = db.query_row("SELECT COALESCE(SUM(reserve),0) FROM markets", [], |r| r.get(0))?;
        Ok(format!("# HELP mtl_accounts Number of paper accounts.\n# TYPE mtl_accounts gauge\nmtl_accounts {accounts}\n# HELP mtl_markets Number of paper markets.\n# TYPE mtl_markets gauge\nmtl_markets {markets}\n# HELP mtl_trades_total Committed paper trades.\n# TYPE mtl_trades_total counter\nmtl_trades_total {trades}\n# HELP mtl_reserve_lamports Aggregate paper reserve lamports.\n# TYPE mtl_reserve_lamports gauge\nmtl_reserve_lamports {reserves}\n"))
    }).await?;
    Ok((
        [(
            header::CONTENT_TYPE,
            "text/plain; version=0.0.4; charset=utf-8",
        )],
        snapshot,
    ))
}
