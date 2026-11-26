use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use mtl_service::{AppState, router};
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
    let (status, result) = call(app, "POST", "/api/v1/sessions", "", json!({})).await;
    assert_eq!(status, StatusCode::CREATED);
    result["token"].as_str().unwrap().to_owned()
}
fn creator(symbol: &str) -> Value {
    json!({"symbol":symbol,"name":"Test Band","genre":"Jazz","description":"Original songs from a test artist.","bio":"A longer biography.","website_url":"https://example.com","music_url":"https://example.com/preview.mp3"})
}

#[tokio::test]
async fn curated_artists_are_explicit_demo_markets_with_no_fake_followers() {
    let app = app();
    let (status, result) = call(&app, "GET", "/api/v1/artists", "", Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    let artists = result["artists"].as_array().unwrap();
    assert_eq!(artists.len(), 5);
    assert_eq!(artists[0]["symbol"], "KINJI");
    for artist in artists {
        assert_eq!(artist["is_demo"], true);
        assert_eq!(artist["following"], false);
        assert_eq!(artist["follower_count"], 0);
        assert_eq!(artist["supply"], 0);
    }
    let detail = call(&app, "GET", "/api/v1/artists/KINJI", "", Value::Null).await;
    assert_eq!(detail.0, StatusCode::OK);
    assert_eq!(detail.1["releases"], json!([]));
    assert_eq!(
        call(&app, "GET", "/api/v1/artists/UNKNOWN", "", Value::Null)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&app, "GET", "/api/v1/artists", "bad", Value::Null)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn profiles_are_authenticated_and_isolated() {
    let app = app();
    let a = session(&app).await;
    let b = session(&app).await;
    let result = call(
        &app,
        "PUT",
        "/api/v1/profile",
        &a,
        json!({"display_name":" Ada ","bio":"New songs."}),
    )
    .await;
    assert_eq!(result.0, StatusCode::OK);
    assert_eq!(result.1["profile"]["display_name"], "Ada");
    assert!(result.1["artist"].is_null());
    assert_eq!(
        call(&app, "GET", "/api/v1/profile", &a, Value::Null)
            .await
            .1["profile"]["bio"],
        "New songs."
    );
    assert_eq!(
        call(&app, "GET", "/api/v1/profile", &b, Value::Null)
            .await
            .1["profile"]["display_name"],
        "New supporter"
    );
    assert_eq!(
        call(
            &app,
            "PUT",
            "/api/v1/profile",
            &a,
            json!({"display_name":" ","bio":""})
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        call(
            &app,
            "PUT",
            "/api/v1/profile",
            &a,
            json!({"display_name":"x".repeat(81),"bio":""})
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        call(&app, "GET", "/api/v1/profile", "", Value::Null)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn registration_is_atomic_owned_and_retry_safe() {
    let app = app();
    let a = session(&app).await;
    let b = session(&app).await;
    let input = creator("jazz");
    let first = call(&app, "POST", "/api/v1/artists", &a, input.clone()).await;
    assert_eq!(first.0, StatusCode::CREATED);
    assert_eq!(first.1["artist"]["symbol"], "JAZZ");
    assert_eq!(first.1["artist"]["is_demo"], false);
    assert_eq!(first.1["mode"], "paper");
    let repeated = call(&app, "POST", "/api/v1/artists", &a, input.clone()).await;
    assert_eq!(repeated.0, StatusCode::OK);
    assert_eq!(repeated.1, first.1);
    assert_eq!(
        call(&app, "POST", "/api/v1/artists", &b, input).await.0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        call(&app, "POST", "/api/v1/artists", &a, creator("OTHER"))
            .await
            .0,
        StatusCode::CONFLICT
    );
    let profile = call(&app, "GET", "/api/v1/profile", &a, Value::Null)
        .await
        .1;
    assert_eq!(profile["artist"]["symbol"], "JAZZ");
    let markets = call(&app, "GET", "/api/v1/markets", "", Value::Null)
        .await
        .1;
    assert_eq!(
        markets["markets"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|m| m["symbol"] == "JAZZ")
            .count(),
        1
    );
}

#[tokio::test]
async fn unsafe_urls_and_invalid_metadata_cannot_create_a_market() {
    let app = app();
    let token = session(&app).await;
    for url in [
        "javascript:alert(1)",
        "data:text/html,test",
        "http://example.com",
        "https://localhost/song.mp3",
        "https://127.0.0.1/song.mp3",
        "https://127.1/song.mp3",
        "https://0177.0.0.1/song.mp3",
        "https://0x7f.0.0.1/song.mp3",
        "https://2130706433/song.mp3",
        "https://%31%32%37.0.0.1/song.mp3",
        "https://127.0.0.1./song.mp3",
        "https://localhost./song.mp3",
        "https://studio.local./song.mp3",
        "https://[::1]/song.mp3",
        "https://example.com\\@127.0.0.1/song.mp3",
        "https://192.168.1.2/song.mp3",
        "https://user:pass@example.com/song.mp3",
        "//example.com/song.mp3",
    ] {
        let mut input = creator("SAFE");
        input["music_url"] = json!(url);
        assert_eq!(
            call(&app, "POST", "/api/v1/artists", &token, input).await.0,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{url}"
        );
    }
    for image in ["/images/../secret", "/images/", "/private/photo.png"] {
        let mut input = creator("SAFE");
        input["image_url"] = json!(image);
        assert_eq!(
            call(&app, "POST", "/api/v1/artists", &token, input).await.0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
    let mut oversized_image = creator("SAFE");
    oversized_image["image_url"] = json!(format!("/images/{}.webp", "x".repeat(512)));
    assert_eq!(
        call(&app, "POST", "/api/v1/artists", &token, oversized_image)
            .await
            .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    for symbol in ["a", "1ABC", "A_BC", "TOO-LONG-SYMBOL", "ééé"] {
        assert_eq!(
            call(&app, "POST", "/api/v1/artists", &token, creator(symbol))
                .await
                .0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
    assert_eq!(
        call(&app, "POST", "/api/v1/artists", &token, creator("ECHO"))
            .await
            .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        call(&app, "POST", "/api/v1/artists", &token, creator("SAFE"))
            .await
            .0,
        StatusCode::CREATED
    );
}

#[tokio::test]
async fn follows_are_idempotent_and_isolated() {
    let app = app();
    let a = session(&app).await;
    let b = session(&app).await;
    for _ in 0..2 {
        let result = call(
            &app,
            "PUT",
            "/api/v1/artists/KINJI/follow",
            &a,
            json!({"following":true}),
        )
        .await;
        assert_eq!(result.0, StatusCode::OK);
        assert_eq!(result.1, json!({"following":true,"follower_count":1}));
    }
    let personal = call(&app, "GET", "/api/v1/artists/KINJI", &a, Value::Null)
        .await
        .1;
    assert_eq!(personal["artist"]["following"], true);
    let other = call(&app, "GET", "/api/v1/artists/KINJI", &b, Value::Null)
        .await
        .1;
    assert_eq!(other["artist"]["following"], false);
    assert_eq!(other["artist"]["follower_count"], 1);
    assert_eq!(
        call(&app, "GET", "/api/v1/feed", &a, Value::Null).await.1["following"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        call(&app, "GET", "/api/v1/feed", &b, Value::Null).await.1["following"],
        json!([])
    );
    for _ in 0..2 {
        assert_eq!(
            call(
                &app,
                "PUT",
                "/api/v1/artists/KINJI/follow",
                &a,
                json!({"following":false})
            )
            .await
            .1["follower_count"],
            0
        );
    }
    assert_eq!(
        call(
            &app,
            "PUT",
            "/api/v1/artists/MISSING/follow",
            &a,
            json!({"following":true})
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn release_ownership_retry_and_followed_feed() {
    let app = app();
    let owner = session(&app).await;
    let fan = session(&app).await;
    call(&app, "POST", "/api/v1/artists", &owner, creator("MUSIC")).await;
    let release = json!({"title":"First release","description":"Written this week.","preview_url":"https://example.com/song.mp3","idempotency_key":Uuid::new_v4().to_string()});
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/artists/MUSIC/releases",
            &fan,
            release.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/artists/KINJI/releases",
            &owner,
            release.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let first = call(
        &app,
        "POST",
        "/api/v1/artists/MUSIC/releases",
        &owner,
        release.clone(),
    )
    .await;
    assert_eq!(first.0, StatusCode::CREATED);
    let repeat = call(
        &app,
        "POST",
        "/api/v1/artists/MUSIC/releases",
        &owner,
        release.clone(),
    )
    .await;
    assert_eq!(repeat.0, StatusCode::OK);
    assert_eq!(repeat.1, first.1);
    let mut changed = release.clone();
    changed["title"] = json!("Different title");
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/artists/MUSIC/releases",
            &owner,
            changed
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let mut invalid = release;
    invalid["preview_url"] = json!("javascript:alert(1)");
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/artists/MUSIC/releases",
            &owner,
            invalid
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        call(&app, "GET", "/api/v1/feed", &fan, Value::Null).await.1["releases"],
        json!([])
    );
    call(
        &app,
        "PUT",
        "/api/v1/artists/MUSIC/follow",
        &fan,
        json!({"following":true}),
    )
    .await;
    let feed = call(&app, "GET", "/api/v1/feed", &fan, Value::Null).await.1;
    assert_eq!(feed["releases"].as_array().unwrap().len(), 1);
    assert_eq!(feed["releases"][0]["artist_name"], "Test Band");
    let detail = call(&app, "GET", "/api/v1/artists/MUSIC", "", Value::Null)
        .await
        .1;
    assert_eq!(detail["releases"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn social_state_survives_restart() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("exchange.db");
    let app = router(AppState::open(&path, 100).unwrap());
    let token = session(&app).await;
    call(
        &app,
        "PUT",
        "/api/v1/profile",
        &token,
        json!({"display_name":"Persistent artist","bio":"About me"}),
    )
    .await;
    call(&app, "POST", "/api/v1/artists", &token, creator("STAYS")).await;
    call(
        &app,
        "PUT",
        "/api/v1/artists/KINJI/follow",
        &token,
        json!({"following":true}),
    )
    .await;
    call(
        &app,
        "POST",
        "/api/v1/artists/STAYS/releases",
        &token,
        json!({"title":"A persistent release"}),
    )
    .await;
    drop(app);
    let reopened = router(AppState::open(path, 100).unwrap());
    let profile = call(&reopened, "GET", "/api/v1/profile", &token, Value::Null)
        .await
        .1;
    assert_eq!(profile["profile"]["display_name"], "Persistent artist");
    assert_eq!(profile["artist"]["symbol"], "STAYS");
    assert_eq!(
        call(
            &reopened,
            "GET",
            "/api/v1/artists/KINJI",
            &token,
            Value::Null
        )
        .await
        .1["artist"]["following"],
        true
    );
    assert_eq!(
        call(&reopened, "GET", "/api/v1/artists/STAYS", "", Value::Null)
            .await
            .1["releases"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn migration_retains_legacy_funds_and_creates_existing_account_profiles() {
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
    drop(db);
    let app = router(AppState::open(&path, 100).unwrap());
    let account = call(&app, "GET", "/api/v1/account", &token, Value::Null)
        .await
        .1;
    assert_eq!(account["cash_lamports"], 99_947_500_000u64);
    assert_eq!(account["holdings"][0]["symbol"], "ECHO");
    assert_eq!(account["holdings"][0]["quantity"], 10);
    // An imported holding without receipts has an unknown purchase basis.
    assert_eq!(account["performance"]["history_complete"], false);
    assert!(account["performance"]["realized_pnl_lamports"].is_null());
    assert!(account["performance"]["cost_basis_lamports"].is_null());
    assert!(account["holdings"][0]["unrealized_pnl_lamports"].is_null());
    assert_eq!(account["performance"]["total_change_lamports"], -5_000_000);
    let markets = call(&app, "GET", "/api/v1/markets", "", Value::Null)
        .await
        .1;
    let echo = markets["markets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["symbol"] == "ECHO")
        .unwrap();
    assert_eq!(echo["supply"], 10);
    assert_eq!(echo["reserve_lamports"], 50_000_000);
    assert_eq!(
        call(&app, "GET", "/api/v1/profile", &token, Value::Null)
            .await
            .1["profile"]["display_name"],
        "New supporter"
    );
    let version: u64 = rusqlite::Connection::open(path)
        .unwrap()
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap();
    assert_eq!(version, 2);
}

#[tokio::test]
async fn signup_admission_is_bounded_and_metrics_are_available() {
    let app = app();
    for _ in 0..30 {
        session(&app).await;
    }
    assert_eq!(
        call(&app, "POST", "/api/v1/sessions", "", json!({}))
            .await
            .0,
        StatusCode::TOO_MANY_REQUESTS
    );
    let metrics = call(&app, "GET", "/metrics", "", Value::Null).await;
    assert_eq!(metrics.0, StatusCode::OK);
    assert!(
        metrics.1["raw"]
            .as_str()
            .unwrap()
            .contains("mtl_accounts 30")
    );
    assert_eq!(
        call(&app, "GET", "/readyz", "", Value::Null).await.0,
        StatusCode::OK
    );
}

#[test]
fn library_enforces_supported_account_capacity() {
    assert!(AppState::open(":memory:", 0).is_err());
    assert!(AppState::open(":memory:", 10_001).is_err());
    assert!(AppState::open(":memory:", 1).is_ok());
    assert!(AppState::open(":memory:", 10_000).is_ok());
}

#[tokio::test]
async fn ordinary_public_links_and_local_artwork_are_supported() {
    let app = app();
    let token = session(&app).await;
    let mut input = creator("LINKS");
    input["website_url"] = json!("https://artist.example.com:8443/about?source=profile");
    input["music_url"] = json!("https://cdn.example.com/music/track%20one.mp3");
    input["image_url"] = json!("/images/artist_1.webp");
    let result = call(&app, "POST", "/api/v1/artists", &token, input).await;
    assert_eq!(result.0, StatusCode::CREATED);
    assert_eq!(result.1["artist"]["image_url"], "/images/artist_1.webp");
}
