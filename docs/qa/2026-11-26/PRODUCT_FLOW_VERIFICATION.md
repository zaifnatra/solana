# Product flow improvements — November 26, 2026

The existing video, horizontal artist cards, glass surfaces, wallet pill and
navigation remain. No login flow or authentication migration was added.

## Changes

- Creator setup has identity, story/links and review steps. Back/edit retains
  entries. Profile, artist and release forms use inline accessible validation.
  Unknown registration/publication outcomes keep their original payload for retry.
- Discover adds genre and name/price/follower sorting with shareable URL state,
  counts, reset, loading and empty states.
- Trade confirmation allows quantity edits and presets. Sells offer Half and All
  (capped at the existing 10,000-token order limit). Changes invalidate the prior
  quote; unresolved orders retain the original payload and cannot be edited.
- Portfolio shows fee-inclusive average cost, realized/unrealized returns,
  remaining investment and direct Buy/Sell actions. Complete receipts, including
  full exits and history beyond 100 fills, drive accounting. Unknown legacy basis
  is unavailable, not invented. No database migration is required.
- Route changes return to the top; the sticky header remains legible over content.

## Verification performed

- 36 Rust tests; formatting and strict Clippy pass. Cases include buy/partial
  sell/rebuy/full exit, fee inclusion, rounding remainder,121 receipts, account
  isolation, legacy migration/restart, and missing receipt history.
- Frontend ESLint, Prettier and production build pass. The wallet dependencies
  still trigger Vite's large-chunk advisory.
- Manual CUA on a disposable local database: public browsing; genre/sort, artist
  detail and return retaining filters; reset; invalid dialog quantity; repeated
  same-quantity preset; buy10 KINJI; receipt→portfolio; sell half; updated cash,
  basis and returns; profile/release inline errors; new browser paper account;
  empty creator steps; invalid optional URL; edit/back preserves data; creator
  registration; publish release and verify after reload.
- Visual checks at375px and desktop1440px. Header wallet label stays inside pill.
  Final console checks returned no warnings/errors.
- Automated container/browser regression expanded with filters, editable quotes,
  portfolio controls, inline validation, step navigation and lost creator-response
  recovery. It runs in GitHub CI; it was not run directly on the development host.

## Deployment boundary

The previous version is live on the Droplet. These changes have only been tested
locally at the time of this report. Publishing an image does not update the
Droplet; production requires the owner's console update. Keep the existing
persistent volume and take a backup before updating.

## Evidence

- [Discover with filters, desktop](discovery-filters-desktop.jpg)
- [Portfolio performance, mobile](portfolio-performance-mobile.jpg)
