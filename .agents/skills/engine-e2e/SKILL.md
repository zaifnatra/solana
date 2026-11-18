---
name: engine-e2e
description: Runs the one-command end-to-end test for the tokenization engine (build, fresh local validator, seeded random trades, solvency check). Use after any change in engine/ or staging/src/engine.js, before you commit or push engine work, or when the user asks if the engine works.
---

# Engine end-to-end test

```bash
cd staging && npm run e2e
```

This command does everything:
1. Runs `npm install` if `node_modules` is missing.
2. Runs `anchor build` in `engine/` (program and IDL).
3. Starts a fresh `solana-test-validator` with the program loaded at its `declare_id`. You do not need a program keypair, `anchor keys sync`, or a deploy step.
4. Runs `staging/scenario.js`, which registers a new artist, makes 50 random buys and sells, then every buyer sells everything. It funds all wallets and the platform fee wallet automatically.
5. Stops the validator.

Options go after `--`: `npm run e2e -- --seed 7 --trades 200 --buyers 5 --max-amount 50`.

## Results

| Exit code | Meaning |
|---|---|
| 0 | Pass |
| 1 | A check failed, or the build or validator failed. Read the output. |
| 2 | A tool is missing, or another validator is already running on port 8899. |

The command prints JSON. Look at `pass`, then `checks`:
- `noFailedTrades`: false means a transaction failed. The `errors` field has the Anchor error code.
- `supplyIsZero` and `reserveDrained`: false means the curve or the payout code loses or creates lamports. This is a real bug. Do not commit it.

`buy`, `sell`, and `register` show `cuAvg` and `cuMax` (compute units). Compare them with an earlier run that used the same `--seed`.

## Failures

- **`Missing anchor` or `Missing solana-test-validator`**: the user must install the Solana toolchain (Rust, Solana CLI 2.3.x, Anchor 0.32.1). Ask before you install anything.
- **`A validator already runs`**: stop the other validator (`pkill solana-test-validator`) or ask the user.
- **The validator does not start**: read `engine/.anchor/validator.log`.
- **`DeclaredProgramIdMismatch`**: `declare_id!` in `lib.rs` and `[programs.localnet]` in `engine/Anchor.toml` must be the same address.
- **A renamed instruction or account fails**: update `staging/src/engine.js`. It calls the instructions by name.

Also run `cd engine && cargo test` for the curve unit tests. That test does not need a validator.
