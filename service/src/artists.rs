//! Persistent creator profiles, discovery, follows, and release updates.
use super::*;
use axum::extract::Path;

const ARTIST_SELECT: &str = "SELECT a.symbol,m.name,a.username,m.genre,a.description,a.bio,a.image_url,a.website_url,a.music_url,a.is_demo,m.supply,m.reserve,(SELECT COUNT(*) FROM follows f WHERE f.symbol=a.symbol),EXISTS(SELECT 1 FROM follows f WHERE f.symbol=a.symbol AND f.account_id=?1),a.owner_id FROM artists a JOIN markets m USING(symbol)";
const ARTIST_ORDER: &str = " ORDER BY CASE a.symbol WHEN 'KINJI' THEN 0 WHEN 'KAYTRA' THEN 1 WHEN 'LEAN' THEN 2 WHEN 'TECCA' THEN 3 WHEN 'BLUE' THEN 4 ELSE 5 END, a.created_at DESC,a.symbol";

#[derive(Serialize)]
struct Artist {
    symbol: String,
    name: String,
    username: String,
    genre: String,
    description: String,
    bio: String,
    image_url: String,
    website_url: String,
    music_url: String,
    is_demo: bool,
    supply: u64,
    reserve_lamports: u64,
    next_token_lamports: u64,
    follower_count: u64,
    following: bool,
    owner_id: Option<String>,
}
fn artist_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Artist> {
    let supply = r.get(10)?;
    Ok(Artist {
        symbol: r.get(0)?,
        name: r.get(1)?,
        username: r.get(2)?,
        genre: r.get(3)?,
        description: r.get(4)?,
        bio: r.get(5)?,
        image_url: r.get(6)?,
        website_url: r.get(7)?,
        music_url: r.get(8)?,
        is_demo: r.get(9)?,
        supply,
        reserve_lamports: r.get(11)?,
        next_token_lamports: curve::buy_cost(supply, 1).unwrap(),
        follower_count: r.get(12)?,
        following: r.get(13)?,
        owner_id: r.get(14)?,
    })
}
fn artist(db: &Connection, symbol: &str, viewer: Option<&str>) -> Result<Artist> {
    db.query_row(
        &format!("{ARTIST_SELECT} WHERE a.symbol=?2"),
        params![viewer, symbol],
        artist_row,
    )
    .optional()?
    .ok_or(ApiError(StatusCode::NOT_FOUND, "Artist not found"))
}
fn optional_hash(headers: &HeaderMap) -> Result<Option<String>> {
    if headers.contains_key(header::AUTHORIZATION) {
        Ok(Some(token_hash(headers)?))
    } else {
        Ok(None)
    }
}
fn viewer(db: &Connection, hash: Option<String>) -> Result<Option<String>> {
    hash.map(|hash| authenticate(db, &hash).map(|(id, _)| id))
        .transpose()
}

pub(super) async fn list(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>> {
    let hash = optional_hash(&headers)?;
    state
        .run(move |db| {
            let id = viewer(db, hash)?;
            let mut stmt = db.prepare(&format!("{ARTIST_SELECT}{ARTIST_ORDER}"))?;
            let artists = stmt
                .query_map([id], artist_row)?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(Json(json!({"artists":artists,"mode":"paper"})))
        })
        .await
}

#[derive(Serialize)]
struct Release {
    id: String,
    symbol: String,
    title: String,
    description: String,
    preview_url: String,
    created_at: u64,
    artist_name: String,
}
fn release_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Release> {
    Ok(Release {
        id: r.get(0)?,
        symbol: r.get(1)?,
        title: r.get(2)?,
        description: r.get(3)?,
        preview_url: r.get(4)?,
        created_at: r.get(5)?,
        artist_name: r.get(6)?,
    })
}
const RELEASE_SELECT: &str = "SELECT r.id,r.symbol,r.title,r.description,r.preview_url,r.created_at,m.name FROM releases r JOIN markets m USING(symbol)";

pub(super) async fn detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(symbol): Path<String>,
) -> Result<Json<Value>> {
    let hash = optional_hash(&headers)?;
    state
        .run(move |db| {
            let id = viewer(db, hash)?;
            let artist = artist(db, &symbol, id.as_deref())?;
            let mut stmt = db.prepare(&format!(
                "{RELEASE_SELECT} WHERE r.symbol=?1 ORDER BY r.rowid DESC LIMIT 100"
            ))?;
            let releases = stmt
                .query_map([symbol], release_row)?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(Json(
                json!({"artist":artist,"releases":releases,"mode":"paper"}),
            ))
        })
        .await
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ProfileInput {
    display_name: String,
    #[serde(default)]
    bio: String,
}
fn clean_text(value: &str, max: usize, required: bool, multiline: bool) -> Result<String> {
    let value = value.trim();
    if (required && value.is_empty())
        || value.chars().count() > max
        || value
            .chars()
            .any(|c| c.is_control() && !(multiline && c == '\n'))
    {
        return Err(invalid(
            "Text is missing, too long, or contains unsupported control characters",
        ));
    }
    Ok(value.to_owned())
}
fn profile_response(db: &Connection, id: &str) -> Result<Json<Value>> {
    let profile = db.query_row(
        "SELECT display_name,bio FROM profiles WHERE account_id=?1",
        [id],
        |r| {
            Ok(ProfileInput {
                display_name: r.get(0)?,
                bio: r.get(1)?,
            })
        },
    )?;
    let owned = db
        .query_row(
            &format!("{ARTIST_SELECT} WHERE a.owner_id=?1"),
            [id],
            artist_row,
        )
        .optional()?;
    Ok(Json(json!({"profile":profile,"artist":owned})))
}
pub(super) async fn profile(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    let hash = token_hash(&headers)?;
    state
        .run(move |db| {
            let (id, _) = authenticate(db, &hash)?;
            profile_response(db, &id)
        })
        .await
}
pub(super) async fn save_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ProfileInput>,
) -> Result<Json<Value>> {
    let hash = token_hash(&headers)?;
    let name = clean_text(&input.display_name, 80, true, false)?;
    let bio = clean_text(&input.bio, 500, false, true)?;
    state
        .run(move |db| {
            let (id, _) = authenticate(db, &hash)?;
            db.execute(
                "UPDATE profiles SET display_name=?1,bio=?2 WHERE account_id=?3",
                params![name, bio, id],
            )?;
            profile_response(db, &id)
        })
        .await
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ArtistInput {
    symbol: String,
    name: String,
    genre: String,
    description: String,
    #[serde(default)]
    bio: String,
    #[serde(default)]
    image_url: String,
    #[serde(default)]
    website_url: String,
    #[serde(default)]
    music_url: String,
}
fn clean_url(value: &str, image: bool) -> Result<String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(String::new());
    }
    if value.len() > 512 || value.contains('\\') {
        return Err(invalid("Links must be valid public HTTPS URLs"));
    }
    if image
        && value.starts_with("/images/")
        && value[8..]
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
        && !value[8..].contains("..")
        && value.len() > 8
    {
        return Ok(value.to_owned());
    }
    let uri = value
        .parse::<axum::http::Uri>()
        .map_err(|_| invalid("Links must be valid public HTTPS URLs"))?;
    let host = uri
        .host()
        .ok_or_else(|| invalid("Links must be valid public HTTPS URLs"))?;
    let hostname = host.trim_end_matches('.').to_ascii_lowercase();
    let private_ip = hostname
        .parse::<std::net::IpAddr>()
        .is_ok_and(|ip| match ip {
            std::net::IpAddr::V4(ip) => {
                ip.is_private()
                    || ip.is_loopback()
                    || ip.is_link_local()
                    || ip.is_unspecified()
                    || ip.is_broadcast()
                    || ip.is_multicast()
            }
            std::net::IpAddr::V6(ip) => {
                ip.is_loopback()
                    || ip.is_unspecified()
                    || ip.is_unique_local()
                    || ip.is_unicast_link_local()
                    || ip.to_ipv4_mapped().is_some()
            }
        });
    // Browsers interpret shortened, octal, hex and escaped numeric hosts as IPs.
    // Accept only canonical IPv4 literals or DNS labels with an alphabetic TLD
    // so the HTTP parser and the browser cannot disagree about the destination.
    let canonical_ip = hostname.parse::<std::net::Ipv4Addr>().is_ok();
    let dns_name = hostname.len() <= 253
        && hostname.contains('.')
        && hostname.rsplit('.').next().is_some_and(|label| {
            label.len() >= 2 && label.bytes().all(|b| b.is_ascii_alphabetic())
        })
        && hostname.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        });
    if uri.scheme_str() != Some("https")
        || value.bytes().any(|b| b.is_ascii_whitespace() || b < 32)
        || uri.authority().is_some_and(|a| a.as_str().contains('@'))
        || hostname == "localhost"
        || hostname.ends_with(".localhost")
        || hostname.ends_with(".local")
        || !(canonical_ip || dns_name)
        || private_ip
    {
        return Err(invalid("Links must be valid public HTTPS URLs"));
    }
    Ok(value.to_owned())
}

pub(super) async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut input): Json<ArtistInput>,
) -> Result<(StatusCode, Json<Value>)> {
    let hash = token_hash(&headers)?;
    input.symbol = input.symbol.trim().to_ascii_uppercase();
    if !(3..=12).contains(&input.symbol.len())
        || !input
            .symbol
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
        || !input.symbol.as_bytes()[0].is_ascii_uppercase()
    {
        return Err(invalid(
            "Symbol must be 3–12 uppercase letters or digits, starting with a letter",
        ));
    }
    input.name = clean_text(&input.name, 80, true, false)?;
    input.genre = clean_text(&input.genre, 40, true, false)?;
    input.description = clean_text(&input.description, 300, true, true)?;
    input.bio = clean_text(&input.bio, 1500, false, true)?;
    input.image_url = clean_url(&input.image_url, true)?;
    if input.image_url.is_empty() {
        input.image_url = "/images/user_profile.webp".into();
    }
    input.website_url = clean_url(&input.website_url, false)?;
    input.music_url = clean_url(&input.music_url, false)?;
    let serialized = serde_json::to_string(&input).map_err(|_| internal())?;
    state.run(move |db| {
        let tx=db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let (id,_)=authenticate(&tx,&hash)?;
        let existing:Option<(String,String)>=tx.query_row("SELECT symbol,registration_json FROM artists WHERE owner_id=?1",[&id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        if let Some((symbol,original))=existing {
            if original!=serialized { return Err(conflict("This account already owns an artist profile")); }
            return Ok((StatusCode::OK,Json(json!({"artist":artist(&tx,&symbol,Some(&id))?,"mode":"paper"}))));
        }
        let exists:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM markets WHERE symbol=?1)",[&input.symbol],|r|r.get(0))?;
        if exists { return Err(conflict("That symbol is already registered")); }
        tx.execute("INSERT INTO markets(symbol,name,genre) VALUES(?1,?2,?3)",params![input.symbol,input.name,input.genre])?;
        tx.execute("INSERT INTO artists(symbol,owner_id,username,description,bio,image_url,website_url,music_url,registration_json,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",params![input.symbol,id,format!("@{}",input.symbol.to_ascii_lowercase()),input.description,input.bio,input.image_url,input.website_url,input.music_url,serialized,now()])?;
        let result=artist(&tx,&input.symbol,Some(&id))?;
        tx.commit()?;
        Ok((StatusCode::CREATED,Json(json!({"artist":result,"mode":"paper"}))))
    }).await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct FollowInput {
    following: bool,
}
pub(super) async fn follow(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(symbol): Path<String>,
    Json(input): Json<FollowInput>,
) -> Result<Json<Value>> {
    let hash = token_hash(&headers)?;
    state
        .run(move |db| {
            let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let (id, _) = authenticate(&tx, &hash)?;
            let current = artist(&tx, &symbol, Some(&id))?;
            if input.following && !current.following {
                let count: u64 = tx.query_row(
                    "SELECT COUNT(*) FROM follows WHERE account_id=?1",
                    [&id],
                    |r| r.get(0),
                )?;
                if count >= 500 {
                    return Err(invalid("You can follow up to 500 artists"));
                }
                tx.execute(
                    "INSERT INTO follows(account_id,symbol,created_at) VALUES(?1,?2,?3)",
                    params![id, symbol, now()],
                )?;
            } else if !input.following {
                tx.execute(
                    "DELETE FROM follows WHERE account_id=?1 AND symbol=?2",
                    params![id, symbol],
                )?;
            }
            let result = artist(&tx, &symbol, Some(&id))?;
            tx.commit()?;
            Ok(Json(
                json!({"following":result.following,"follower_count":result.follower_count}),
            ))
        })
        .await
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ReleaseInput {
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    preview_url: String,
    #[serde(default)]
    idempotency_key: Option<String>,
}
pub(super) async fn publish(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(symbol): Path<String>,
    Json(mut input): Json<ReleaseInput>,
) -> Result<(StatusCode, Json<Value>)> {
    let hash = token_hash(&headers)?;
    input.title = clean_text(&input.title, 120, true, false)?;
    input.description = clean_text(&input.description, 1200, false, true)?;
    input.preview_url = clean_url(&input.preview_url, false)?;
    let key = input
        .idempotency_key
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    if Uuid::parse_str(&key).is_err() {
        return Err(invalid("Idempotency key must be a UUID"));
    }
    input.idempotency_key = Some(key.clone());
    let serialized = serde_json::to_string(&input).map_err(|_| internal())?;
    state.run(move |db| {
        let tx=db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let (id,_)=authenticate(&tx,&hash)?;
        let current=artist(&tx,&symbol,Some(&id))?;
        if current.owner_id.as_deref()!=Some(&id) { return Err(ApiError(StatusCode::FORBIDDEN,"Only the artist owner can publish releases")); }
        let existing:Option<String>=tx.query_row("SELECT request_json FROM releases WHERE symbol=?1 AND idempotency_key=?2",params![symbol,key],|r|r.get(0)).optional()?;
        if let Some(original)=existing {
            if original!=serialized { return Err(conflict("Idempotency key already used for a different release")); }
            let release=tx.query_row(&format!("{RELEASE_SELECT} WHERE r.symbol=?1 AND r.idempotency_key=?2"),params![symbol,key],release_row)?;
            return Ok((StatusCode::OK,Json(json!({"release":release}))));
        }
        let count:u64=tx.query_row("SELECT COUNT(*) FROM releases WHERE symbol=?1",[&symbol],|r|r.get(0))?;
        if count>=100 { return Err(invalid("This artist has reached the 100-release limit")); }
        let release=Release { id:Uuid::new_v4().to_string(),symbol,title:input.title,description:input.description,preview_url:input.preview_url,created_at:now(),artist_name:current.name };
        tx.execute("INSERT INTO releases(id,symbol,title,description,preview_url,created_at,idempotency_key,request_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![release.id,release.symbol,release.title,release.description,release.preview_url,release.created_at,key,serialized])?;
        tx.commit()?;
        Ok((StatusCode::CREATED,Json(json!({"release":release}))))
    }).await
}
pub(super) async fn feed(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>> {
    let hash = token_hash(&headers)?;
    state.run(move |db| {
        let (id,_)=authenticate(db,&hash)?;
        let mut stmt=db.prepare(&format!("{ARTIST_SELECT} WHERE EXISTS(SELECT 1 FROM follows f WHERE f.symbol=a.symbol AND f.account_id=?1){ARTIST_ORDER}"))?;
        let following=stmt.query_map([&id],artist_row)?.collect::<std::result::Result<Vec<_>,_>>()?;
        let mut stmt=db.prepare(&format!("{RELEASE_SELECT} WHERE EXISTS(SELECT 1 FROM follows f WHERE f.symbol=r.symbol AND f.account_id=?1) ORDER BY r.rowid DESC LIMIT 100"))?;
        let releases=stmt.query_map([id],release_row)?.collect::<std::result::Result<Vec<_>,_>>()?;
        Ok(Json(json!({"following":following,"releases":releases})))
    }).await
}
