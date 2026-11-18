---
name: engine-staging
description: Opens the staging dashboard for manual engine testing, and runs the before-and-after loop for optimizing the engine (compute units, fees, curve changes). Use when you optimize or benchmark engine/, or when the user wants to try trades by hand. For a single pass/fail check, use engine-e2e.
---

# Engine staging

`staging/` runs the real program from `engine/` on a local validator. It is separate from `web/`.

| File | Purpose |
|---|---|
| `staging/run.sh` | Builds the engine, starts a fresh validator, then runs the scenario (`e2e`) or the dashboard (`up`). |
| `staging/src/engine.js` | Client for the UI and the CLI. Reads the IDL from `engine/target/idl/sol_proj.json`. |
| `staging/scenario.js` | Headless seeded scenario. Prints JSON. |
| `staging/src/App.jsx` | The dashboard. |

## Dashboard

```bash
cd staging && npm run up      # http://localhost:5174, Ctrl-C stops the validator too
```

1. Click **New session**. This creates and funds a throwaway artist and three buyers, then registers the artist.
2. Choose a buyer and an amount, then click **Buy** or **Sell**. **State** shows supply, the reserve above the rent minimum, the platform balance, and each buyer's holdings.
3. **Run scenario** runs the same scenario as the CLI. Each run adds a row with pass or fail and compute units.

Every `npm run up` starts with an empty ledger. The old session is cleared automatically.

## Optimization loop

1. Run `cd engine && cargo test`.
2. Record a baseline: `cd staging && npm run e2e -- --seed 1 --trades 100 > /tmp/before.json`.
3. Make one change in `engine/`.
4. Run the same command again into `/tmp/after.json`.
5. Compare `pass`, `buy.cuAvg`/`cuMax`, `sell.cuAvg`/`cuMax`, and `feesCollected`. Keep the change only if `pass` is still `true`.

The common compute unit costs are `msg!` logs, `find_program_address`, `init_if_needed`, and CPIs.

## Rules

- If you change `PLATFORM_WALLET` in `lib.rs`, also change the fallback in `staging/src/engine.js`.
- Off localnet, the platform wallet must hold at least the rent minimum before it can receive fees. The staging scripts do this only where airdrops work.
- Burner keys for the dashboard are in browser `localStorage`. They are for localnet only.
