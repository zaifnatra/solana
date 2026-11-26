## What and why

<!-- One or two sentences. Link the issue: Closes #123 -->

## How I tested

- [ ] `cd web && npm run lint && npm run build`
- [ ] `cd service && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings && cargo test --locked` (service changes)
- [ ] `cd staging && npm run e2e` (engine changes only)
- [ ] Checked the UI by hand (UI changes only)
