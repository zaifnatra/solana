# Proposed local Solana toolchain installation

Status: **installation on hold at the owner's request; code work only**. This document records the
sources inspected on 2026-11-27. It is not an installer or a claim that software is
vulnerability-free. Versions below match this repository's existing CI workflow;
they are not claimed to be the newest releases.

## What the tools do

- Solana CLI / Agave provides transaction/account command-line tools, the local
  `solana-test-validator`, and the contract build tooling.
- Anchor compiles the Rust contract and produces its IDL (the machine-readable
  instruction interface). Our contract uses Anchor 0.32.1.
- Local-validator testing creates disposable test identities and balances. It
  does not require a recovery phrase, a funded wallet, or a mainnet connection.
- Devnet deployment is a separate step requiring a deliberately chosen devnet
  deployment identity. Installing a compiler does not deploy the application.

## Exact Apple Silicon release artifacts

| Component | Published release | Artifact | Published SHA-256 |
| --- | --- | --- | --- |
| Agave / Solana 2.3.13 | [Anza release](https://github.com/anza-xyz/agave/releases/tag/v2.3.13) | `solana-release-aarch64-apple-darwin.tar.bz2` | `b2045f2c2ca8c97b82733bada6c9c11b46196c1acd8f00e33742a7d2c2060a12` |
| Anchor 0.32.1 | [Anchor release](https://github.com/otter-sec/anchor/releases/tag/v0.32.1) | `anchor-0.32.1-aarch64-apple-darwin` | `10c63cc7af8aaa3e0dde9c4bfad17c6a47797e7685d5f25236b14d6d5642a02a` |

Digests were read from the GitHub [Agave asset listing](https://github.com/anza-xyz/agave/releases/expanded_assets/v2.3.13)
and [Anchor asset listing](https://github.com/otter-sec/anchor/releases/expanded_assets/v0.32.1).
The older `solana-foundation/anchor` URL currently redirects to `otter-sec/anchor`;
the actual destination is disclosed here rather than assuming the old ownership
path still applies. [Anchor's version-specific release notes](https://www.anchor-lang.com/docs/updates/release-notes/0-32-1)
describe the 0.32.1 release and its Solana 2.3 compatibility recommendation.

## Proposed method and limits

After approval, download the named release assets, verify their full hashes before
executing them, and unpack into `/tmp/mtl-solana-tools`. Inspect archive paths before
extraction. Use a command-local PATH; no administrator privileges or edits to shell
startup files are needed. The temporary directory can be removed later.

A matching digest confirms the bytes match the published release. It cannot prove
that the publisher, build pipeline, or program itself is trustworthy. GitHub commit
signature badges are not equivalent to independent binary audits.

Contract builds can fetch additional dependencies. Cargo resolves crates from its
configured registries using the repository's lockfile. Solana's SBF build step may
fetch a platform compiler bundle. Those are executable build inputs too; inspect
and record the actual pinned compiler source before permitting its first download.
Do not replace these review steps with an uninspected `curl | sh` installer.

No user wallet secrets should be supplied to a compiler installation. Devnet-only
keys belong in explicitly selected ignored local files, not in the public source,
Docker image, chat, or a production secret store.
