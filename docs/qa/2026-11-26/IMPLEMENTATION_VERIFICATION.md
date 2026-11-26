# Connected app verification — November 26, 2026

Tested the built React app served by the Rust service at http://127.0.0.1:8080,
using a disposable SQLite database at /tmp/mtl-browser-test.sqlite3. All transactions
used simulated balances. The final backend was rebuilt and restarted; saved
profile, creator identity, and receipts remained present.

## Browser checks completed

- Original video background, horizontal photo/glass cards, green Buy buttons,
  wallet pill, and four-tab navigation remain present.
- Whitespace-padded KINJI search returns the intended artist and survives reload.
- Zero, negative, fractional, and blank quantities show an inline error without
  opening trade confirmation.
- Created a paper account; previewed and bought 10 KINJI; verified 10 tokens and
  a receipt after Wallet reload; sold all 10 and verified the second receipt.
- An oversized buy displayed insufficient funds and disabled confirmation;
  selling beyond market supply was rejected.
- Edited display name and biography, then verified both after reload.
- Registered Northern Lights Demo (NLDEMO), published Night Drive — Demo, and
  verified the release on the artist page.
- Followed the demo artist; verified the release in Friends after reload;
  unfollowed and verified the feed returned to its empty state.
- Every card's Buy and Sell button fits inside its card at 320, 375, 390, 768,
  and 1440 pixels. Saved a screenshot at 375 pixels; reset viewport afterward.
- Found and fixed dropdown click interception by the search wrapper; final
  Help, Escape, and Profile pointer navigation pass.
- Wallet chooser opens with Phantom and Solflare. No wallet connection or
  signature was attempted.
- No console warnings/errors returned by the final browser log check.

## Other checks

- Rust: 31 tests pass; rustfmt and strict Clippy pass.
- Frontend: ESLint and production build pass.
- Recovery: five Python tests pass; deployment shell scripts pass syntax checks;
  Compose/workflow YAML parses.
- Browser smoke script passes JavaScript syntax validation and independent
  selector/API review. It includes separate-account feed checks and a deliberately
  lost order response to verify retry safety, plus the manual paths above.
- git diff --check passes.

## Verification boundaries

The automated Playwright smoke suite was authored for CI but was not executed
locally. Interrupted-network recovery and simultaneous browser identity changes
were reviewed in code; the manual UI session did not simulate them. External audio
playback was not tested because no licensed audio fixture was supplied.

Docker is not installed on this machine. Image builds, actual Compose startup,
TLS/proxy execution, and a containerized restore remain CI/host acceptance checks.
No image was published, no cloud server was provisioned, and no on-chain engine
scenario was rerun (engine sources were unchanged). The wallet dependency bundle
remains substantial; the dependency audit reports 21 low/moderate findings and
no high/critical findings.

## Evidence

- [Mobile Discover](discover-connected-mobile.jpg)
- [Persistent paper receipts](wallet-connected.jpg)
- [Initial audit](../../WEBSITE_AUDIT.md)
