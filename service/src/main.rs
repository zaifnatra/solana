use mtl_service::{AppState, router};
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "mtl_service=info,tower_http=info".into()),
        )
        .init();
    let database = std::env::var("MTL_DATABASE").unwrap_or_else(|_| "mtl.sqlite3".into());
    let bind = std::env::var("MTL_BIND").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let web_dir = std::env::var("MTL_WEB_DIR").unwrap_or_else(|_| "../web/dist".into());
    let max_accounts = std::env::var("MTL_MAX_ACCOUNTS")
        .unwrap_or_else(|_| "10000".into())
        .parse::<u64>()?;
    if !(1..=10000).contains(&max_accounts) {
        return Err("MTL_MAX_ACCOUNTS must be between 1 and 10000".into());
    }
    let state = AppState::open(database, max_accounts)
        .map_err(|e| format!("Storage initialization failed: {e:?}"))?;
    let app = router(state).fallback_service(
        ServeDir::new(&web_dir).not_found_service(ServeFile::new(format!("{web_dir}/index.html"))),
    );
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!(address=%bind, mode="paper", "MTL trading service started");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

async fn shutdown() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install Ctrl-C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
    tracing::info!("draining requests before shutdown");
}
