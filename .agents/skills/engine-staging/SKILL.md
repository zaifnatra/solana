---
name: engine-staging
description: Runs the tokenization engine on a local validator and measures it with the staging UI or the headless scenario CLI (compute units, fees, solvency checks). Use when testing, benchmarking, or optimizing engine/ (the Anchor program or curve.rs), or when you need to check that an engine change still works.
---

# Engine staging

`staging/` runs the real program from `engine/` on a local validator. It is not connected to `web/`.

| Part | Path | Purpose |
|---|---|---|
| Curve math | `engine/programs/sol_proj/src/curve.rs` | Pure Rust, unit tests. Fastest loop. |
| Program | `engine/programs/sol_proj/src/lib.rs` | Accounts, CPIs, checks |
| Staging client | `staging/src/engine.js` | Shared by the UI and the CLI. Reads the IDL from `engine/target/idl/sol_proj.json`. |
| Scenario CLI | `staging/scenario.js` | Headless run, prints JSON. Use this as an agent. |
| Staging UI | `staging/src/App.jsx` | Manual trades, state, scenario history |

## Prerequisites

Rust (version pinned in `engine/rust-toolchain.toml`), the Solana CLI, Anchor CLI 0.32.1, and Node 20 or later.
Check with `cargo --version && solana --version && anchor --version`. If a tool is missing, stop and ask the user before you install anything.

## Start

```bash
# Terminal 1: build, deploy, and keep a validator running
cd engine
anchor keys sync      # first time on a new machine only: matches declare_id to target/deploy keypair
anchor localnet       # builds, starts solana-test-validator, deploys the program

# Terminal 2
cd staging && npm install
npm run scenario                  # headless
npm run dev                       # UI at http://localhost:5174
```

`anchor localnet` blocks. As an agent, start it in the background, write its output to a log, and wait until `solana cluster-version -u localhost` succeeds. Then run the scenario.
After every Rust change, stop the validator and run `anchor localnet` again. That command rebuilds the program and regenerates the IDL. The validator ledger resets, so old UI sessions become empty. Click **New session**.

## Scenario CLI

```bash
npm run scenario -- --trades 100 --seed 7 --buyers 3 --max-amount 20
RPC_URL=http://127.0.0.1:8899 npm run scenario
```

The scenario creates a new artist, makes random buys and sells with a seeded random generator, then every buyer sells everything.
Exit code: `0` pass, `1` a check failed, `2` program not deployed.

Output fields:
- `checks.noFailedTrades`: every transaction succeeded.
- `checks.supplyIsZero` and `checks.reserveDrained`: after the final sells, the artist reserve is back at the rent minimum exactly. This is the solvency invariant. If it fails, the curve or the payout math leaks lamports.
- `buy`, `sell`, `register`: `count`, `failed`, `cuAvg`, `cuMax` (compute units from the confirmed transaction).
- `feesCollected`: total lamports the platform wallet received.
- `errors`: Anchor error codes (for example `MathOverflow`, `InsufficientReserve`).

## Optimization loop

1. Run `cd engine && cargo test` to check the curve.
2. Record a baseline: `npm run scenario -- --seed 1 --trades 100 > /tmp/before.json`.
3. Make one change in `engine/`.
4. Restart `anchor localnet`. Run the same command again into `/tmp/after.json`.
5. Compare `pass`, `buy.cuAvg/cuMax`, `sell.cuAvg/cuMax`, and `feesCollected`. Keep the change only if `pass` is still `true`.
6. Use the same seed to compare two runs. Use more seeds and more trades to look for edge cases.

The common compute unit costs are `msg!` logging, PDA derivation (`find_program_address`), `init_if_needed`, and CPIs.

## Rules

- `staging/src/engine.js` hardcodes `PLATFORM_WALLET` only as a fallback for the IDL. If you change the constant in `lib.rs`, change it here too.
- The platform wallet must be rent-exempt before it can receive fees. `prepare()` funds it on localnet. On any other cluster, fund it yourself first, or every buy fails.
- If you rename an instruction, an account, or an account field, update `engine.js`. The IDL changes automatically, but the client uses the names.
- Use the scenario only on localnet. It airdrops 1000 SOL per wallet. Devnet limits airdrops.
- Burner keypairs for the UI are in browser `localStorage` (`staging-session`). They are for localnet only.
