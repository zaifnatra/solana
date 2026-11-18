# Contributing

1. Open an issue first for anything bigger than a small fix.
2. Make a branch from `main`. Name it `feat/...`, `fix/...`, or `chore/...`.
3. Open a pull request to `main`. Fill in the template.
4. CI must pass. Pull requests are squash-merged, and the branch is deleted after the merge.

You cannot push to `main` directly. Every change goes through a pull request.

## Checks

CI runs these on every pull request. Run the ones for your change before you push.

| Change | Command |
|---|---|
| `web/` | `cd web && npm run lint && npm run build` |
| `engine/` or `staging/` | `cd engine && cargo test`, then `cd staging && npm run e2e` |

The engine checks need Rust, the Solana CLI (2.3.x), and Anchor 0.32.1. See [Run it](README.md#run-it). If you do not have them, CI runs the checks for you.

## Where things go

- Engine logic: `engine/programs/sol_proj/src/`. Put pure math in `curve.rs` and add a unit test.
- The frontend calls the engine only through `web/src/engine/index.js`.
- UI styles follow `.agents/skills/mtl-design/SKILL.md`.
