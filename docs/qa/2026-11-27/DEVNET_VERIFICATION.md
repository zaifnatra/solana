# Devnet source verification — 2026-11-27

This work prepares wallet-signed artist-token trading with test funds. It is not a
deployment report. No development tools were installed, no keys generated or
funded, and no on-chain transactions submitted during this work. The owner chose
code work only and put toolchain installation on hold.

## Completed checks

- 13 frontend Node tests pass: devnet/market identity, bounded Anchor encoding,
  exact integer quotes, fees/rent, simulated failures, signature persistence before
  submission, changed messages/payers, storage failure, RPC uncertainty, and
  preservation of newer pending records, and quote expiry while the wallet prompt is open.
- 17 deployment Python tests pass: 12 devnet guard/identity/ABI/diagnostic tests
  plus the 5 existing backup tests. CLI/network behavior is mocked.
- Six standalone Rust curve tests pass with the already available compiler.
- Frontend ESLint, default paper build, and explicit devnet build pass. Vite reports
  a bundle-size warning; builds succeed.
- Rust formatting, JS syntax checks, and diff whitespace checks pass.
- Mocked devnet browser checks completed at 375px and 1440px. Inspected screenshots
  of the market page and connect-wallet dialog; no horizontal overflow. Public
  browsing requests no wallet, and wrong-network/missing-manifest states expose
  no trade buttons. Zero transactions were submitted. Tests use deterministic
  fixture addresses, never a deployed artist or funded wallet.

## Unverified / blocked

- Required `npm --prefix staging run e2e` stops at `Missing anchor`.
- Offline engine Cargo tests stop because `anchor-lang` is not cached. Thus the
  updated Anchor program and adversarial validator scenarios have not yet been
  compiled/executed. Passing standalone curve tests does not validate the program.
- Full existing paper browser regression was attempted with installed Chrome but
  did not complete. Diagnostic output explicitly reports: `DevTools remote
  debugging is disallowed by the system admin.` No policy bypass was attempted.
  The shortened mocked devnet run completed before this restriction interrupted
  longer runs; it does not substitute for full browser regression.
- No Docker runtime verification, devnet deployment, real wallet execution, or
  independent security audit was performed. CI includes the Node tests, mocked
  devnet browser checks, and the existing validator/container flows for later runs.

## Review findings addressed

Bounded instructions use new discriminators (`buy_token_bounded` and
`sell_token_bounded`). Old Anchor programs can otherwise ignore appended arguments
on the original instructions and execute without bounds. Browser codecs, staging,
IDL validation, and regression checks now agree on the distinct ABI.

Wallet-switch and same-wallet cross-tab recovery races were corrected. A missing
history response after blockhash expiry remains unresolved; the pending signature
is retained and new trading is blocked. Direct SPL burns preserve the existing
curve-counter/donation policy; manifest checks allow mint supply below that counter.

## Next acceptance step

When the required tools become available, compile the updated program, run the
local-validator happy-path and adversarial suites, then deploy a dedicated devnet
identity and execute a real test-wallet buy/sell round trip. Check wallet balances,
reserve/supply, fees, expired/rejected trades, and refresh/recovery from actual
chain results. Keep mainnet disabled. See ../../REAL_TRADING.md for the workflow.
