# Contributing

1. Open an issue first for anything bigger than a small fix.
2. Make a branch from `main`. Use a descriptive branch name (`codex/...` for agent-created branches).
3. Open a pull request to `main`. Fill in the template.
4. CI must pass. Pull requests are squash-merged, and the branch is deleted after the merge.

You cannot push to `main` directly. Every change goes through a pull request.

## Checks

CI runs these on every pull request. Run the ones for your change before you push.

| Change | Command |
|---|---|
| `web/` | `cd web && npm run lint && npm run build` |
| `service/` | `cd service && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings && cargo test --locked` |
| Browser/API integration | Start a disposable paper service, then `cd web && npx playwright install chromium && npm run test:e2e` |
| Deployment/recovery | `python3 -m unittest discover -s deploy -p "test_*.py"`, then container and restore checks in [DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| `engine/` or `staging/` | `cd engine && cargo test`, then `cd staging && npm run e2e` |

The engine checks need Rust, the Solana CLI (2.3.x), and Anchor 0.32.1. See [Run it](README.md#run-it). If you do not have them, CI runs the checks for you.

## Where things go

- Engine logic: `engine/programs/sol_proj/src/`. Put pure math in `curve.rs` and add a unit test.
- The frontend calls the paper API only through `web/src/engine/index.js`; the Solana engine is separate.
- Use `make dev` for Docker hot reload, or the native two-terminal flow in the README.
- Browser smoke tests create practice accounts, markets, releases, and trades. Never point them at a shared production database.
- Optimized media is checked in. To regenerate it, install Pillow and run `python3 scripts/optimize-media.py`; video poster regeneration also needs ffmpeg or `--poster-frame`. Preserve originals and their attribution.
- UI styles follow `.agents/skills/mtl-design/SKILL.md`.

## Rust service

For changes in `service/`, run `cargo fmt --check`,
`cargo clippy --locked --all-targets -- -D warnings`, and `cargo test --locked`
inside that directory. No validator is required. See [API docs](docs/API.md).

Preserve the existing frontend's screen layouts, media backgrounds, artist cards,
wallet controls, and navigation when adding service integration. A backend change
is not a reason to replace the visual design.
