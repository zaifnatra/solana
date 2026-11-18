# Handoff: local engine setup and staging UI check

Do these steps on a machine where you want the full engine toolchain. Delete this branch when you finish.

## Status

CI (`.github/workflows/ci.yml`) runs these checks on every pull request, and they pass:
- `web/`: lint and build.
- `engine/`: `cargo test` (curve unit tests). The program compiles.
- `npm run e2e -- --trades 100`: `anchor build`, a fresh validator, 104 trades, and all solvency checks pass. Compute units: register about 22.3k, buy about 21.7k on average (49.6k max, when a buyer's first buy creates the token account), sell about 14.3k.
- The staging UI build.

Nobody has clicked through the staging dashboard against a live validator yet. That is the main open item.

## 1. Install the toolchain (about 3 GB, all in your home folder)

| Tool | Version | Command |
|---|---|---|
| Rust | 1.89.0 (from `engine/rust-toolchain.toml`) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh -s -- -y --no-modify-path` |
| Solana CLI | v2.3.13 (recommended for Anchor 0.32) | `sh -c "$(curl -sSfL https://release.anza.xyz/v2.3.13/install)"` |
| Anchor | 0.32.1 | macOS on Apple silicon: download `anchor-0.32.1-aarch64-apple-darwin` from https://github.com/solana-foundation/anchor/releases/tag/v0.32.1 to `~/.cargo/bin/anchor`, then run `chmod +x`. Other systems: `cargo install --git https://github.com/solana-foundation/anchor --tag v0.32.1 anchor-cli` |

Add to `~/.zshrc`:

```bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

Check: `cargo --version && solana --version && anchor --version`

To remove everything: `rm -rf ~/.rustup ~/.cargo ~/.local/share/solana ~/.cache/solana`, then delete the `PATH` line.

## 2. Run the checks

```bash
cd engine && cargo test
cd ../staging && npm install && npm run e2e
```

`npm run e2e` must print `"pass": true` and exit with `0`. The first run takes several minutes, because `anchor build` downloads the Solana platform tools.

## 3. Check the staging UI

```bash
cd staging && npm run up     # opens http://localhost:5174, Ctrl-C stops everything
```

- [ ] The header shows `deployed` in green.
- [ ] **New session** fills in Session (artist, platform, 3 buyers) and State (supply 0).
- [ ] Buy 10 as buyer 1: supply 10, buyer 1 holds 10. Transactions shows the CU, a positive reserve change, and a fee change of 5% of the cost.
- [ ] Sell 10 as buyer 1: supply 0. The reserve above rent goes back to 0.
- [ ] Sell more than you hold: the row shows an error, and the state does not change.
- [ ] **Run scenario** with the defaults: a new row shows `pass`.
- [ ] Stop with Ctrl-C, then run `npm run up` again: the old session is cleared, and **New session** works.
- [ ] Repeat the checks at a 375 px window width.

Fix any problem in a `fix/...` branch and open a pull request.

## 4. Notes

- To push changes to `.github/workflows/`, git needs a token with the `workflow` scope. If your credential helper's token does not have it, run: `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`.
- Possible next work: shrink the 20 MB `web/public/images/user_profile.png`. Remove old large files from git history (`git filter-repo`). The `.git` folder is 160 MB.
