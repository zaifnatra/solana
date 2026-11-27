# Real trading: wallet-signed Solana artist tokens

The next execution mode is **devnet artist-token trading**. Visitors browse freely;
a wallet is needed when they approve a trade. Existing paper balances never become
real SOL and are never merged with on-chain balances. The original design remains.

This branch supplies source code and preparation tooling. **No devnet program has
been deployed or funded, no real-money mode is enabled, and toolchain installation
is on hold at the user's request.** Offline tests are distinct from a successful
validator/devnet run. Devnet uses test tokens with no monetary value.

## What an exchange company would separate

Coinbase documents a hosted custody model in which it holds private keys for
customer accounts. Coinbase Prime also exposes multi-person transfer approval
policies and cold-storage workflows. Those are public product facts, not a claim
that Coinbase's unpublished internal architecture has been reproduced here.

| Concern | Custodial exchange model | This application's devnet path |
| --- | --- | --- |
| Customer authority | Exchange account and custody policies | User wallet signs each trade |
| Execution | Exchange order execution plus internal account balances | Anchor bonding curve executes atomically on Solana |
| Assets | Customer assets held by exchange/custodian | User token accounts; program-controlled curve reserve |
| Server records | Authoritative customer ledger requiring custody reconciliation | Read models/indexed transactions; chain remains settlement source |
| Withdrawals | Separate custody transfer system and controls | No application withdrawal balance; assets are in the user's wallet/program |
| Funding | Banking/payment rails and custody operations | Devnet faucet initially; possible provider-hosted onramp later |

Sources: [Coinbase hosted custody](https://help.coinbase.com/en/coinbase/other-topics/legal-policies/what-does-coinbase-do-with-my-digital-assets),
[Prime approval policies](https://help.coinbase.com/en/prime/securing-your-account/security-settings),
[Prime cold storage](https://help.coinbase.com/en/prime/trading-and-funding/transfer-funds-between-your-trading-balance-and-vault).
The choice of a wallet-signed curve is our architectural recommendation. It avoids
customer custody but still requires secure contract design and authority handling.

## Execution boundary

The devnet client reads actual artist profiles, reserves, token mints and holdings
from Solana. It builds a bounded trade instruction, asks the wallet to sign, submits
it, tracks the transaction, and refreshes confirmed state. A quote is not a fill.
An RPC timeout is not proof that a submitted trade failed. Clients must resolve the
original signature before retrying a logically new trade.

Trade ABI version 2 uses distinct `buy_token_bounded` and `sell_token_bounded`
instructions with maximum total debit for buys, minimum net proceeds for sells,
and an expiry timestamp for both. New Anchor discriminators ensure an old program
rejects these instructions instead of ignoring appended arguments. These bounds are enforced by the program, not only
by UI validation. The program, network, fee destination, and artist/mint addresses
are explicit deployment configuration. Display names and symbols are not identity.

The paper service's SHA-256 receipt journal is an integrity feature for paper
receipts; it does not settle or authorize these wallet transactions. See
[blockchain coverage](BLOCKCHAIN_COVERAGE.md) for the distinction.

## Reproducible devnet preparation

Prerequisites, once installation is authorized: the repository's pinned Rust
engine toolchain, Solana CLI 2.3.x, Anchor 0.32.1, Node, and the locked staging
JavaScript dependencies (`npm ci` in `staging/`). The scripts do not install tools.
Do not run staging's random scenario against devnet: its faucet/funding assumptions
are for a fresh local validator.

Everything private/generated lives in ignored `deploy/devnet-state/`. The local
configuration `deploy/devnet.config.json` is also ignored. Keep both out of Docker
contexts, commits, shared screenshots, and issue attachments. The fee wallet is a
wallet you explicitly choose and control; it is not a copied historical constant.
Never reuse mainnet keys for these steps. Path isolation cannot identify a mainnet
key that someone manually copies into the devnet directory.

After the tools are installed, run these commands locally from the repository root:

```sh
umask 077
mkdir -p deploy/devnet-state/keys
# These commands create LOCAL DEVNET-ONLY keys; --silent suppresses secret output.
solana-keygen new --no-bip39-passphrase --silent --outfile deploy/devnet-state/keys/payer.json
solana-keygen new --no-bip39-passphrase --silent --outfile deploy/devnet-state/keys/artist.json
solana-keygen new --no-bip39-passphrase --silent --outfile deploy/devnet-state/keys/fee.json
cp deploy/devnet.config.example.json deploy/devnet.config.json
solana-keygen pubkey deploy/devnet-state/keys/fee.json
```

Put that last **public key** in `platform_wallet` in the local configuration and
choose the artist's symbol/name. Keys stay on your machine; never paste keypair
contents into chat. Then create the separate program identity:

```sh
python3 deploy/devnet.py init-program
python3 deploy/devnet.py preflight
python3 deploy/devnet.py prepare
python3 deploy/devnet.py build
```

`prepare` copies `engine/` into `deploy/devnet-state/workspace/`, excluding build
outputs, then replaces only that copy's declared program ID and fixed fee wallet.
It writes an isolated Anchor config and copies the program identity into the local
build directory. The shared engine source, original program identity, and staging
configuration are unchanged. An existing prepared workspace is not overwritten;
move it aside and prepare again after changing source/configuration.

`build` validates the resulting IDL's program ID, fee destination, and bounded
trade ABI. It emits public IDL and build hashes under `deploy/devnet-state/public/`.
It does not deploy. CLI errors retain diagnostics in a private mode-600 log under
`deploy/devnet-state/logs/`; inspect those locally, redact before sharing.

The workflow accepts only `https://api.devnet.solana.com` and checks the RPC genesis
against `EtWTRABZaYq6iMfeYKouRu166VU2xqa1`. It ignores the Solana CLI's global
network settings. It rejects mainnet/testnet/custom RPC URLs and mismatching genesis
responses. This deliberately excludes paid/provider endpoints from the first setup.

## Explicit devnet deployment and artist registration

These are **later operator actions**, not steps already completed by this branch.
Fund only the dedicated devnet payer, artist authority, and fee wallet using the
[Solana devnet faucet](https://faucet.solana.com/). Check their public addresses with
`solana-keygen pubkey`. The payer pays deployment/transaction fees, the artist
pays profile/mint rent, and the fee wallet must exist as an ordinary system wallet.
The scripts do not purchase SOL, call payment services, request airdrops, or move
funds between your wallets.

```sh
# These two commands submit transactions using valueless DEVNET SOL.
python3 deploy/devnet.py deploy
python3 deploy/devnet.py register
```

The program keypair is distinct from all wallet identities. For this test deployment,
the payer retains upgrade authority; **this is not a mainnet custody recommendation**.
The registration tool rechecks genesis, program ownership, deployed bytes against the
local build, and upgrade authority before registering artists. It derives the PDAs,
checks existing records rather than duplicating them, and verifies profile/mint
ownership, authorities, decimals and supply. Mint supply may be less than the curve
counter after holders burn tokens directly; it must never exceed that counter.
It generates the public manifest only
after all configured artists pass. Partial registration may have succeeded if a later
artist fails; rerunning verifies existing artists and continues missing registrations.

## Public deployment manifest

The emitted `deploy/devnet-state/public/devnet-markets.json` contains no keys:

```json
{
  "version": 1,
  "abi_version": 2,
  "cluster": "devnet",
  "genesis_hash": "EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "program_id": "<generated program public key>",
  "platform_wallet": "<chosen fee-wallet public key>",
  "markets": [{
    "symbol": "DEMO",
    "name": "Your devnet artist",
    "artist_authority": "<artist public key>",
    "artist_profile": "<derived profile PDA>",
    "token_mint": "<derived mint PDA>"
  }]
}
```

There are 1–16 markets with unique symbols of 2–12 uppercase letters/digits,
starting with a letter.
The frontend independently validates the manifest and on-chain accounts; absent or
invalid configuration fails closed instead of showing fake on-chain markets.

After successful registration, copy **only the public manifest** into
`web/public/devnet-markets.json`. Set build-time environment:

```dotenv
VITE_TRADING_MODE=devnet
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_DEVNET_MANIFEST_URL=/devnet-markets.json
```

The default mode is `paper`. The devnet experience is at `/devnet`; do not silently
switch existing paper trades or balances. Vite variables are public browser values,
so no private keys, server API secrets, or private RPC credentials belong there.
Docker builds must receive the same explicit build arguments and public manifest;
private deployment state must never be copied into an image. A new image must be
built for a changed Vite configuration.

## Mainnet is a separate launch decision

Before real value is enabled, complete contract review/adversarial testing, define
secure upgrade/treasury authority custody and recovery, use production/fallback RPC,
implement transaction reconciliation and incident monitoring, and validate real
asset addresses. These are engineering recommendations grounded in Solana's
[production readiness](https://solana.com/developers/docs/tools/production-readiness)
and [security guidance](https://solana.com/developers/docs/tools/security).
No public RPC endpoint provides an adequate production service guarantee.

A hosted provider can later fund user wallets with supported assets. Coinbase
Onramp lists Solana/SOL and offers direct wallet funding, with full-access onboarding
and location-dependent asset/payment options. It does not automatically support
our custom artist tokens. [Onramp overview](https://docs.cdp.coinbase.com/onramp/introduction/welcome)
and [security requirements](https://docs.cdp.coinbase.com/onramp/security-requirements)
explain the integration boundary; wallet authentication can protect session creation
without introducing a conventional site password account.

Operating country, customer geography, token rights, artist fundraising terms and
who controls funds must be settled before a public real-money launch. This project
has not determined regulatory applicability. FINTRAC describes virtual-currency
exchange/transfer and crowdfunding business criteria; the CSA says platform models
and token circumstances affect securities requirements. Noncustodial operation is
not by itself a legal exemption. US access introduces separate FinCEN and SEC
analysis, including the SEC's 2026 interpretation. Relevant primary references:
[FINTRAC](https://fintrac-canafe.canada.ca/msb-esm/msb-eng),
[CSA](https://www.securities-administrators.ca/investor-tools/crypto-assets/buying-and-selling-crypto-assets/),
[FinCEN](https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-certain-business-models),
[SEC](https://www.sec.gov/rules-regulations/2026/03/s7-2026-09).

## Offline validation

```sh
python3 -m unittest discover -s deploy -p 'test_devnet.py'
node --check deploy/devnet-register.mjs
```

The tests mock CLI processes and verify network rejection, selected fee identity,
key isolation/permissions, preservation of shared source, configuration drift,
ABI checks, and private failure diagnostics. They do not prove that Anchor compiled,
that the devnet deploy succeeded, or that a wallet trade landed. Complete engine
local-validator tests and then the explicit devnet buy/sell acceptance flow before
claiming those outcomes.
