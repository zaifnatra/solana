# Trading API v1

The base URL is `/api/v1`. All settlement is **paper trading**, with fictional tokens
and simulated SOL. There are no deposits, withdrawals, wallet signatures, or RPC
transactions. The frontend and API use the same origin; CORS is disabled.
Artist profiles, following, releases, and paper portfolios persist in SQLite.

Money is expressed as integer lamports (1 SOL = 1,000,000,000 lamports). Token amounts
are whole integers, 1–10,000 per order. A market cannot exceed 100,000 tokens. These
bounds keep response amounts within JavaScript's safe integer range.

| Method | Endpoint | Authentication | Result |
| --- | --- | --- | --- |
| GET | `/healthz` (outside API prefix) | No | Process liveness |
| GET | `/readyz` (outside API prefix) | No | Database connectivity |
| GET | `/metrics` (outside API prefix) | No | Aggregate Prometheus account/market/trade/reserve metrics |
| GET | `/artists` | Optional bearer | Discover artists and current paper-market state |
| GET | `/artists/{symbol}` | Optional bearer | Artist details and latest 100 releases |
| POST | `/artists` | Bearer | Register one creator-owned paper market |
| GET / PUT | `/profile` | Bearer | Read or edit the current profile |
| PUT | `/artists/{symbol}/follow` | Bearer | Idempotently follow/unfollow |
| POST | `/artists/{symbol}/releases` | Bearer, owner only | Publish a release update |
| GET | `/feed` | Bearer | Followed artists and their latest 100 releases |
| GET | `/markets` | No | Symbols, artist metadata, supply, reserve, next-token price |
| POST | `/sessions` | No | New paper account, 100 paper SOL, bearer token |
| GET | `/account` | Bearer | Cash, holdings, fee-inclusive cost basis and portfolio performance |
| POST | `/quotes` | Bearer | Fee-inclusive quote, valid for 30 seconds |
| POST | `/orders` | Bearer | Atomically execute an order, return a receipt |
| GET | `/orders` | Bearer | Your latest 100 fills, newest first |
| GET | `/audit` | Bearer | Your paginated hash-linked receipt history |

## Create an account

```sh
curl -sS -X POST http://localhost:8080/api/v1/sessions
```

The response contains `token`, `cash_lamports`, and `mode: "paper"`. Store the token
privately. Send `Authorization: Bearer <token>` on authenticated requests. The server
stores only its SHA-256 hash. There is no recovery or cross-device identity system;
losing a token loses access to that paper account. API clients are responsible for securely retaining the token.
Do not log tokens or put them in URLs. TLS is required for remote access.

## Portfolio performance

`GET /account` retains `cash_lamports`, `holdings`, and `mode`. Holdings add
`cost_basis_lamports`, `realized_pnl_lamports`, `unrealized_pnl_lamports`, and
`history_complete`. Liquidation value is the current curve sell refund after fees.

The `performance` object includes `starting_balance_lamports`,
`holdings_value_lamports`, `portfolio_value_lamports`, `total_change_lamports`,
`cost_basis_lamports`, `realized_pnl_lamports`, `unrealized_pnl_lamports`,
`history_complete`, and `cost_basis_method: "average_cost"`.

Accounting reads the complete committed ledger, including closed positions and
trades older than the latest 100 displayed receipts. Buys add their fee-inclusive
debit to cost basis. Each partial sell allocates `floor(basis × sold / held)`;
the rounding remainder stays with the remaining tokens. A full exit consumes
all remaining basis. Realized return uses net sale proceeds after fees.
For complete history, realized plus unrealized return equals portfolio value
minus the starting balance exactly. Signed returns are integer lamports.

If legacy balances cannot reconcile with their receipts, affected cost basis and
returns are `null` with `history_complete: false`; current balances and liquidation
estimates remain available. Values are estimates, not guaranteed execution prices.
There is no schema migration for these additive fields. Same-second fills use
SQLite insertion order; preserve the database with the supplied SQLite backup
workflow rather than reconstructing trades in a different insertion order.

## Review and execute

```sh
# Set TOKEN to your returned account token in your shell.
curl -sS http://localhost:8080/api/v1/quotes \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"symbol":"ECHO","side":"buy","quantity":10}'
```

Response at zero supply:

```json
{
  "symbol": "ECHO",
  "side": "buy",
  "quantity": 10,
  "gross_lamports": 50000000,
  "fee_lamports": 2500000,
  "total_lamports": 52500000,
  "expires_at": 1795737630
}
```

The timestamp above is illustrative. Copy the **returned** `expires_at` and
`total_lamports` into the order. Generate a new UUID for `idempotency_key` for each
new intent:

```json
{
  "symbol": "ECHO",
  "side": "buy",
  "quantity": 10,
  "limit_lamports": 52500000,
  "expires_at": 1795737630,
  "idempotency_key": "99322e43-2d27-4181-b4ae-56ca63db0c04"
}
```

POST that object to `/orders` with the same bearer header. For buys, `limit_lamports`
is the **maximum total debit including fees**. For sells, it is the **minimum net
credit after fees**. The service recalculates at execution time; favorable price
movement is allowed, adverse movement beyond the limit returns HTTP 409. Quotes do
not reserve inventory. These are immediate curve orders, not resting limit orders.
The deadline must be in the future and at most 60 seconds away.

The receipt includes `id`, `symbol`, `side`, `quantity`, `gross_lamports`,
`fee_lamports`, `total_lamports`, and `created_at` (Unix seconds).

## Retry semantics

Persist the exact order body before sending it. If a timeout, disconnect, or 5xx
leaves the outcome unknown, resend **the same body and key**. A committed order
returns its original receipt, even after its original deadline. Reusing a key with
a different body returns 409. Keys are scoped to an account and persist with SQLite.
Clients should retain unresolved orders until their result is known, including
across reloads if they run in a browser.

## Errors and limits

Application errors use `{"error":"message"}`. Axum's malformed JSON, unsupported
content type, and body-limit errors may be plain text; inspect status codes first.

- `401`: missing or invalid account token.
- `404`: unknown market or API path.
- `409`: expired deadline, price limit exceeded, or conflicting idempotency key.
- `422`: invalid quantity, insufficient funds or holdings, invalid key/body.
- `413`: request body exceeds 16 KiB.
- `429`: global signup admission limit exceeded; retry after 60 seconds.
- `403`: publishing a release for an artist the caller does not own.
- `503`: account cap reached, or all 64 database work slots are occupied.
- `500`: storage error; the transaction rolls back unless already committed.

The account cap defaults to 10,000 and can be lowered with `MTL_MAX_ACCOUNTS`.
A process-wide limit allows at most 30 signup attempts per minute. It uses a
monotonic clock, does not trust forwarded IP headers, and leaves authenticated
operations available when signup is throttled. It resets when the process restarts.
No account has reset/faucet privileges. Public registration is not proof of identity;
protect it with gateway rate limits or access control for an internet-facing demo.
Trade history is bounded to the last 100 fills in API responses; the ledger itself
is retained in the database.


## Artist discovery and ownership

`GET /artists` returns `{artists:[...],mode:"paper"}`. Each artist includes:

```
symbol, name, username, genre, description, bio, image_url,
website_url, music_url, is_demo, supply, reserve_lamports,
next_token_lamports, follower_count, following, owner_id
```

`owner_id` is a public account identifier, not a credential. `following` reflects
the bearer account, or is false without authentication. If a bearer header is
supplied but invalid, the endpoint returns 401 rather than silently treating it
as anonymous. `GET /artists/{symbol}` returns `{artist, releases, mode:"paper"}`.

KINJI, KAYTRA, LEAN, TECCA, and BLUE are explicitly labeled demo profiles tied to
new paper markets. They do not represent artist-issued or artist-endorsed tokens.
Follower counts start at zero; no release activity is fabricated. Legacy ECHO,
MUSE, and NOVA markets remain available via `/markets` and retain every existing
balance and receipt. They are not silently renamed to the featured artists.

Create a creator profile and its zero-supply paper market with:

```json
{
  "symbol": "MYBAND",
  "name": "My Band",
  "genre": "Jazz",
  "description": "Original songs from Montreal.",
  "bio": "A longer artist biography.",
  "image_url": "/images/user_profile.webp",
  "website_url": "https://example.com",
  "music_url": ""
}
```

`POST /artists` returns HTTP 201 with `{artist,mode:"paper"}`. Each account can own
one artist, and symbols are unique across all markets. Repeating the same normalized
registration with the same account returns HTTP 200 and the existing artist.
Different registration data on an account that already owns an artist returns 409.
This allows recovery after a lost registration response without creating a second
market. Names and bios are plain text; clients must render them as text.

| Field | Limit |
| --- | --- |
| `symbol` | 3–12 ASCII letters/digits, first character a letter; normalized uppercase |
| `name` | 1–80 characters |
| `genre` | 1–40 characters |
| `description` | 1–300 characters |
| `bio` | 0–1,500 characters |
| URL fields | 0–512 bytes each |

Leading/trailing whitespace is trimmed. Control characters are rejected except
newlines in descriptions/bios. URLs must use public HTTPS with no embedded
credentials; local/private IPs and local hostnames are rejected. Hosts must be
canonical IPv4 addresses or ASCII DNS names with an alphabetic final label;
shortened/encoded numeric hosts and IPv6 literals are rejected. DNS is not
resolved during validation. Image URLs may
also be safe single filenames below `/images/`, with no traversal. An empty image
URL defaults to `/images/user_profile.webp`. The service stores URLs but does not
fetch them; media availability and rights remain the publisher's responsibility.

## Current profile

`GET /profile` returns `{profile:{display_name,bio},artist}` where `artist` is the
current account's owned artist or null. New accounts start as `New supporter`.
`PUT /profile` accepts `{display_name,bio}` and returns the same response shape.
Display names are required and limited to 80 characters; bios to 500. Editing one
account never changes another account's profile. These are paper-account identities,
not verified Solana wallet ownership.

## Following and releases

`PUT /artists/KINJI/follow` accepts `{"following":true}` or `false` and returns
`{following,follower_count}`. Repeating the same state is safe. An account can follow
up to 500 artists. `GET /feed` returns `{following:[artists],releases:[releases]}`;
only releases by currently followed artists appear, newest first.

Artist owners can POST to `/artists/{symbol}/releases`:

```json
{
  "title": "New single",
  "description": "A note for supporters.",
  "preview_url": "https://example.com/preview.mp3",
  "idempotency_key": "56d3cb45-ce4d-4686-bcb2-e2d28789b054"
}
```

Titles are required, up to 120 characters. Descriptions may contain up to 1,200
characters. Preview URLs are optional public HTTPS URLs. The response is
`{release:{id,symbol,title,description,preview_url,created_at,artist_name}}`.
The initial response is 201; repeating the same UUID and normalized body returns
200 with the original release. Different data with the same key returns 409.
If omitted, a new UUID is generated, so clients that need retry safety should always
provide and retain a key. Only the owning account can publish. Demo profiles have
no owner and cannot be claimed through this endpoint. The limit is 100 releases
per artist. A release is an artist-authored update, not a blockchain transaction.

## Audit export

`GET /api/v1/audit?after=0` returns at most 500 receipts in chain order:

```json
{
  "checkpoint": { "version": 1, "account_id": "<account-id>", "sequence": 501, "hash": "<64 lowercase hex>" },
  "after": 0,
  "entries": [{ "sequence": 1, "previous_hash": "<genesis hash>", "hash": "<entry hash>", "trade": "<receipt object as returned by POST /orders>" }],
  "next_after": 500,
  "has_more": true
}
```

The example abbreviates the entries array and receipt object. Each `trade` is a
full receipt with `id`, `symbol`, `side`, `quantity`, `gross_lamports`,
`fee_lamports`, `total_lamports`, and `created_at`.

Keep `through` equal to the first response's `checkpoint.sequence` and request
`after=next_after&through=CHECKPOINT_SEQUENCE` until `has_more` is false. New trades
can continue during this export. Store each response as one compact JSON line;
pass the resulting file to `mtl-audit verify`. Starting an export after sequence
zero is useful for browsing, but the offline verifier requires the complete
prefix from genesis. An empty account returns one empty final page at sequence 0.

The credential selects the account: clients cannot select another account ID.
Missing/invalid credentials return 401; ranges outside `0 <= after <= through <=
current head` return 422; detected integrity failures return a generic 500.
Malformed query values return 400. Responses have `Cache-Control: no-store`.
There is no public cross-account audit feed. Checkpoints and receipt exports
contain private trading history; share them deliberately.

See [verification and checkpoint retention](BLOCKCHAIN_COVERAGE.md#verify-your-history)
for offline commands, the exact hash encoding, and limits on what verification proves.
