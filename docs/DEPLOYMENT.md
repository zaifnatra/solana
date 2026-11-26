# Develop and deploy MTL Minted

MTL is a single-instance paper-trading service: Rust serves the API and built React
frontend, with SQLite on durable local disk. The original frontend design is kept.
No container configuration enables real-money trading or submits Solana transactions.

## Choose the right setup

| Need | Command / configuration |
| --- | --- |
| Develop with Vite hot reload and Rust rebuilds | `make dev` (`compose.dev.yaml`) |
| Run the full release-style app from source | `make up` (`compose.yaml`) |
| Deploy a published image with TLS and rate limits | `compose.production.yaml` |
| Native development without Docker | Root README |

Docker Engine / Docker Desktop with the Compose plugin is required for the container
commands. Development and local release-style Compose both use port 8080; stop one
before starting the other. `docker compose down` keeps data; **adding `-v` deletes
volumes**. All examples below run from the repository root.

## Local development

```sh
make dev
```

Open http://localhost:5173. The frontend proxies API calls to `api:8080` inside the
Compose network. Source changes update Vite immediately. A small polling watcher
rebuilds Rust when service sources, migrations, Cargo manifests, or shared curve
math change. A compiler error stops the API until the source is fixed. Cargo and
Node dependencies, Rust build output, and paper data use separate named volumes.

The initial build needs network access for package registries. After changing
frontend dependencies, refresh the dependency volume:

```sh
docker compose -f compose.dev.yaml run --rm web npm ci
```

Use `make dev-down` to stop. Restarting keeps paper accounts and positions.
This container path needs no host Rust, Node, Solana CLI, or Anchor installation.
The separate on-chain staging project still uses its own documented tools.

## Local release-style image

```sh
make up
curl --fail http://127.0.0.1:8080/readyz
```

Open http://localhost:8080. `Dockerfile` builds the UI and Rust binary separately,
then runs the result as UID/GID 10001. The runtime has a read-only root filesystem,
a writable `/data` volume, readiness health check, dropped capabilities, resource
limits, rotating logs, and graceful shutdown. No Node server runs in production.

`make image` builds `mtl-minted:local` without starting it. Build arguments
`NODE_IMAGE` and `RUST_IMAGE` can be pinned to verified upstream digests for your
release process. Cargo and npm use their checked-in lockfiles.

## Public images for open-source users

The **Container image** GitHub workflow builds `linux/amd64` and `linux/arm64`
images, with SBOM and provenance attestations. It publishes only on a GitHub Release
or an explicit manual run with **publish=true**. Pull requests build and test without
publishing. The workflow verifies the application and a restored backup before
publication. It uses the repository-scoped `GITHUB_TOKEN`, not a stored registry
password.

Published names follow `ghcr.io/<owner>/<repository>`, lowercased. Release tags
produce version tags; every image receives a full Git SHA tag. Stable releases also
update `latest`. Use the **immutable digest printed in the workflow summary** for
deployment and rollback, rather than a moving `latest` tag.

Publishing has not been performed by this setup. The repository maintainer must
make the GHCR package **public** in its package settings if anonymous pulls are
wanted; repository visibility alone does not guarantee package visibility. Public
GHCR images support anonymous pulls. Private packages require registry authentication.
See [GitHub package permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages)
and [Docker attestations](https://docs.docker.com/build/ci/github-actions/attestations/).

The source license does not automatically license the original demo artist media.
Review the repository's media credits and substitute authorized media in public
release images as appropriate.

## DigitalOcean recommendation

Use a **Droplet with Docker Compose and durable local storage** for this SQLite
version. Pull prebuilt images on the VM; do not compile the full stack on a small
production machine. A Docker Marketplace Droplet includes Docker tooling;
[DigitalOcean's Docker image](https://docs.digitalocean.com/products/marketplace/catalog/docker/)
is one installation option.

DigitalOcean App Platform's local filesystem is ephemeral and does not support the
persistent volume semantics this SQLite installation needs. Moving there later
requires a supported external database and corresponding application changes.
See [App Platform storage](https://docs.digitalocean.com/products/app-platform/how-to/store-data/).

GHCR is a good default for publicly pullable open-source images. DigitalOcean
Container Registry is an alternative for private images; it is not required simply
because the service runs on a Droplet. See the
[DOCR quickstart](https://docs.digitalocean.com/products/container-registry/getting-started/quickstart/).

No Droplet, domain, cloud account, image publication, or paid resource is created by
these files. Provision only after choosing the account, region, domain, and budget.

## Production setup

Prerequisites: one Linux host with Docker/Compose, an SSH key, a domain pointing at
the host, and a published MTL image. On the host, allow SSH only from the operator's
addresses, and public TCP 80/443 (UDP 443 is optional HTTP/3). Never publish 8080.
Copy the Compose file and `deploy/` directory from the same release as the image.

```sh
cp deploy/production.env.example deploy/production.env
# Edit MTL_IMAGE, MTL_DOMAIN, ACME_EMAIL, and optional account/data-volume settings.
docker compose --env-file deploy/production.env -f compose.production.yaml config --quiet
docker compose --env-file deploy/production.env -f compose.production.yaml pull
docker compose --env-file deploy/production.env -f compose.production.yaml up -d --wait
curl --fail https://YOUR_DOMAIN/readyz
```

Set `MTL_IMAGE` to the workflow's `ghcr.io/...@sha256:...` value. Caddy handles TLS
issuance and renewal. Its certificate data lives in a persistent volume. Nginx is an
internal gateway; the application is on a separate internal network. Only Caddy
has published ports. No Docker socket is mounted into any service.

### Request limits and proxy trust

Nginx limits account creation to five requests/minute per client, with a burst of
five, and other API requests to ten/second, with a burst of thirty. Each client has
a thirty-connection ceiling. Exceeding a gateway limit returns 429. Request bodies
are capped at 16 KiB by the gateway; the service may impose stricter endpoint limits.
These are adjustable starting values, not protection against every form of abuse.

Caddy overwrites `X-MTL-Client-IP` from the immediate network peer. Nginx trusts
**only 172.30.251.10**, the configured Caddy address, to provide that value. It clears
proxy identity headers before forwarding to Rust. Client-supplied `X-Forwarded-For`
is never used for rate-limit identity. The backend also has its own global signup
limit and account ceiling.

The proxy network uses `172.30.251.0/24`. If it overlaps an existing host/VPN network,
change the network and both static addresses in Compose **and** the exact trusted
Caddy address in `deploy/nginx.conf` together. Do not expose the gateway directly.
When adding a CDN in front, the default limits apply to CDN edge addresses. Configure
a verified trusted-CDN chain deliberately; do not simply trust arbitrary forwarding
headers.

## Configuration and monitoring

| Variable | Purpose |
| --- | --- |
| `MTL_IMAGE` | Required published image, preferably `@sha256:...` |
| `MTL_DOMAIN` | Required public hostname |
| `ACME_EMAIL` | Required TLS certificate contact |
| `MTL_DATA_VOLUME` | Named data volume; defaults to `mtl-production-data` |
| `MTL_MAX_ACCOUNTS` | Paper account ceiling; defaults to 10,000 |
| `MTL_BIND` | Native binary listen address; image uses `0.0.0.0:8080` |
| `MTL_DATABASE` | Native database path; image uses `/data/mtl.sqlite3` |
| `MTL_WEB_DIR` | Native frontend path; image uses `/app/web` |
| `RUST_LOG` | Structured logging filter |

The binary does not automatically read `.env` files. Compose receives production
values through `--env-file`. Do not commit the real environment file.

Monitor `/readyz` externally and track 5xx/429 responses, container restarts, disk
space, backup age, and database growth. `/healthz` checks liveness; `/readyz` checks
storage. `/metrics` provides aggregate Prometheus metrics and is deliberately
blocked by the public gateway. A local monitoring agent can fetch it privately:

```sh
docker compose --env-file deploy/production.env -f compose.production.yaml exec -T mtl \
  curl --fail --silent http://127.0.0.1:8080/metrics
```

Gateway logs exclude query strings and authorization headers. The service uses
structured logs. TLS headers allow HTTPS image/audio previews and wallet/RPC
connections; tighten their allowlists if you restrict the accepted media providers.

## Backup and recovery

Use the SQLite online backup API, not a raw copy of a live database/WAL file. The
script creates a consistent archive, checks SQLite integrity/foreign keys, and
reconciles account cash, market reserves, holdings, and fees. It does not stop the
service. The host needs Python 3 for verification; sqlite3 is included in the image.

Local Compose:

```sh
./deploy/backup.sh
./deploy/restore-check.sh backups/mtl-TIMESTAMP-PID.tgz
```

Production Compose (use these variables for all backup/restore scripts):

```sh
export MTL_COMPOSE_FILE=compose.production.yaml
export MTL_ENV_FILE=deploy/production.env
./deploy/backup.sh /path/to/private/backups
./deploy/restore-check.sh /path/to/private/backups/mtl-TIMESTAMP-PID.tgz
```

`restore-check.sh` verifies the archive, restores into a new temporary Docker volume,
starts the configured image with **no network exposure**, checks readiness and market
reads, then removes only its temporary container/volume. This proves that the backup
can start the service; it does not replace a full disaster-recovery exercise.

To verify only the archive without Docker:

```sh
python3 deploy/verify_backup.py /path/to/backup.tgz
```

To recover production, restore into a **new named volume**:

```sh
./deploy/restore-volume.sh /path/to/verified-backup.tgz mtl-recovered-2026-11-26
```

The script refuses an existing volume. Run `restore-check.sh` first, stop production,
set `MTL_DATA_VOLUME` in the production environment to the new volume, then start
with the matching image. Keep the old volume intact until recovery is verified.
Never overlay an old database onto active WAL files.

Schedule backups with the host's scheduler once the destination and retention are
chosen. Keep them private, encrypted off-host, and periodically restore-test them.
The archive contains account credentials in hashed form and private profile data.
The scripts do not automatically upload or delete backups. VM snapshots are useful
in addition to, not a replacement for, tested database backups.

## Upgrade and rollback

1. Take and verify a backup. Record the running image digest and data-volume name.
2. Change `MTL_IMAGE` to the tested new digest; pull and run `up -d --wait`.
3. Check public readiness, a paper buy/sell flow, and the logs.
4. If rolling back across a schema change, restore the compatible backup into a new
   volume and run the older image against that volume. A newer database may be
   deliberately rejected by an older binary.

Keep one application replica with local disk. Horizontal scaling requires a different
storage and execution design. After a backup, commands such as `down -v`, destructive
volume pruning, or removing the Droplet can still erase live state; they are not
part of these upgrade commands.

## Validation status

The deployment scripts include local unit tests and CI runs configuration validation,
container startup, browser flows, an online backup, and an isolated restore check.
Docker was not installed in the authoring environment, so local shell/YAML/backup
verification is distinct from executing the container stack. A successful CI run or
host acceptance run is required before treating the image as deployment-verified.
