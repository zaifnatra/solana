# Blockchain concepts in MTL Minted

This maps the supplied SOEN 321 “Blockchain overview” lecture (Set 10, 20 pages)
to this repository. The lecture is reference material; its PDF is not redistributed.
The hosted application uses centralized **paper trading**. The separate Anchor
program implements artist-token trading for a Solana development environment.
These are distinct execution paths, even though they share curve mathematics.

| Lecture concept | Existing implementation | Work in this branch / boundary |
| --- | --- | --- |
| Transactions and smart contracts (pp. 3, 7, 13) | `engine/programs/sol_proj/src/lib.rs`: artist registration, reserve-backed buy/mint and sell/burn instructions | The hosted Rust service still settles simulated balances in SQLite. |
| Authorized writers versus readers (p. 8) | Anchor `Signer` accounts, PDA/mint/owner constraints; service bearer credentials protect account operations | Public discovery stays public; audit exports are restricted to the caller's paper account. |
| Hash-linked data, genesis, timestamps (pp. 3–6) | Solana supplies its ledger when executing the Anchor program; paper receipts previously had no hash linkage | `service/src/audit.rs` adds per-account SHA-256 genesis hashes, explicit sequence numbers, predecessor hashes, and receipt commitments including timestamps. These are receipt chains, not mined blocks. |
| Append-only history and verification (p. 15) | SQLite transactions and persistent receipts; no receipt edit/delete API | Schema 3 audit journal has SQL update/delete guards, startup checks, paginated exports, and a Rust offline verifier. External checkpoints expose rewriting of the retained prefix. |
| Double-spending prevention (pp. 16–17) | Anchor token burn, reserve checks, transaction signers; paper service serializes settlement and checks balances/idempotency | Journal writes share the settlement transaction. A journal failure rolls back cash, holdings, market state, and the receipt. Hashing alone does not prevent double-spending. |
| Peer networking, consensus, replication, forks (pp. 6–7, 15) | Delegated to the Solana network for on-chain execution | Not implemented by the hosted service. SQLite persistence/backups are not decentralized consensus or replicated validators. |
| Permissionless versus permissioned systems (pp. 9–12) | The on-chain program targets Solana; the hosted service has one trusted database operator | The hosted application is a centralized service, not a permissioned blockchain. Public browsing does not make validation permissionless. |
| Proof of work, Hashcash, nonce mining (pp. 16–20) | No custom PoW miner | Intentionally absent: a local mining loop would add CPU cost without providing independent validators or protecting a single operator's database. |
| NFTs, supply chains, external truth (pp. 13–14) | Artist metadata and fungible-token experiments | No NFT ownership proof, oracle, or verification that an artist controls real-world rights. A hash cannot prove those claims. |

Page 12's decision tree is useful here: the hosted paper exchange already trusts a
single writer. A new consensus network is unnecessary for that architecture. The
receipt journal adds a narrow, testable integrity feature while keeping that trust
boundary explicit. Real on-chain web trading would require wallet-signed order
submission, confirmation handling, and reconciliation; that is not enabled here.

Source-code coverage is not a claim that the Anchor program is deployed on mainnet
or independently security-audited. This change does not modify the engine or UI.
Solana's [transaction documentation](https://solana.com/docs/core/transactions)
describes network transaction signatures and atomic execution; those guarantees
apply to submitted Solana transactions, not the hosted paper API.

## Verify your history

Build the Rust tools from the repository root:

```sh
cargo build --locked --manifest-path service/Cargo.toml --bins
```

An operator can export an account's receipts from a schema-3 database. These
commands open the database read-only and use a consistent SQLite snapshot:

```sh
umask 077
service/target/debug/mtl-audit check-db /path/to/mtl.sqlite3
service/target/debug/mtl-audit export /path/to/mtl.sqlite3 ACCOUNT_ID > receipts.jsonl
service/target/debug/mtl-audit verify receipts.jsonl > checkpoint.json
```

Account owners can instead collect the authenticated `/api/v1/audit` pages
without database access; see [API pagination](API.md#audit-export). Exports include
only receipt fields, account ID, sequence, and hashes; no bearer token, token hash,
idempotency key, or original order request is included.

Retain `checkpoint.json` independently of the server, such as on your own device.
For a later export, verify against the old checkpoint before retaining the new one:

```sh
service/target/debug/mtl-audit verify later-receipts.jsonl checkpoint.json > next-checkpoint.json
```

Keep the old checkpoint until verification exits successfully. Never redirect the
new output over the checkpoint being read. CLI failures print a diagnostic to
stderr and exit nonzero. Successful `verify` prints only the resulting checkpoint
JSON to stdout; without a retained checkpoint, stderr explains the weaker guarantee.
The Docker runtime installs `mtl-audit` on PATH; invoke it with `docker compose exec`
or override the image's `mtl-service` entrypoint for standalone CLI use.

## Exactly what is committed

Version 1 uses SHA-256 with the following canonical byte encoding:

- `U(n)` is an unsigned 64-bit big-endian integer.
- `S(s)` is `U(UTF8(s).length)` followed by the UTF-8 bytes.
- Genesis: `SHA256("MTL-AUDIT-GENESIS-v1\0" || S(account_id))`.
- Entry: `SHA256("MTL-AUDIT-ENTRY-v1\0" || S(account_id) || U(sequence) || S(previous_hash) || S(id) || S(symbol) || S(side) || U(quantity) || U(gross_lamports) || U(fee_lamports) || U(total_lamports) || U(created_at))`.

The domains end with one zero byte. Hashes are 64-character lowercase hex strings;
`previous_hash` is encoded as that string, not raw digest bytes. Entry sequences
start at 1; genesis is checkpoint sequence 0. Receipt time is Unix seconds as stored
by the service, not an independently attested timestamp. JSON formatting is not
part of the hash. The account ID in the checkpoint binds the chain to one account.

An export is JSONL with one compact page per line, at most 500 entries per page,
with a fixed checkpoint across every page. The streaming verifier limits each line
to 2 MiB, starts at genesis, and rejects gaps, reorderings, bad hashes, unsupported
versions, inconsistent page boundaries, missing final pages, or extra trailing pages.
It requires an externally supplied checkpoint to match the same account and prefix.

## Guarantees and limits

- Ordinary changes to committed receipt fields, missing receipts, and broken links
  fail verification. Startup checks every chain; exports verify the requested
  pages. This is not continuous monitoring of out-of-band database writes.
- A database owner can drop triggers, alter receipts, and recompute every hash.
  Internal consistency checks alone cannot distinguish this from genuine history.
  An independently retained checkpoint detects changes through its saved sequence,
  including truncation before that point. It cannot detect loss of a later suffix
  that nobody retained or establish which competing unanchored history is genuine.
- The migration records a baseline for existing receipts in insertion order. It
  proves nothing about whether that pre-migration history was already altered.
- Verification proves hash consistency, not correct prices, economic solvency,
  legal ownership, timestamps, real-world artist identity, or blockchain finality.
  Existing accounting checks remain separate.
- This journal covers trades only. Profiles, follows, releases, mutable balances,
  and market metadata are not committed by these receipt hashes.
- SQL guards discourage accidental edits; backups protect availability; external
  checkpoints support rewrite detection. None makes the database immutable.
- Exporting private trading history is an explicit account/administrative operation.
  No global public ledger or new login screen is introduced.

## Validation

`cargo test --locked --manifest-path service/Cargo.toml` covers independent SHA-256
vectors, existing-schema migration/restart, empty chains, multi-page exports, frozen
prefixes, anchored extensions, forged histories, truncation, mutation, account
isolation, idempotent retries, rollback after journal failure, SQL guards, and CLI
export/verify/database-check workflows. Container build/backup/restore acceptance
must also pass before deployment; local Rust tests do not substitute for it.
