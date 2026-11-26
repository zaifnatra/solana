# Proposed DigitalOcean deployment

Status: prepared for review; no Droplet, domain, registry, or billable resource has
been created. The owner chose a new Droplet and will provide a budget.

## Starting configuration

- One Basic Droplet, 2 GiB RAM, 1 vCPU, 50 GiB local disk, running a supported Ubuntu
  LTS with Docker Engine and Compose. This is a starting size for a small paper
  demo, not a measured capacity guarantee.
- Pull a tested, versioned GHCR image. Do not compile the Rust/JS application on
  the small production VM.
- Keep SQLite on the local persistent volume with one application replica.
- Caddy terminates TLS; the internal gateway rate-limits API/registration traffic.
- Expose only ports 80/443 publicly and restrict SSH to the operator's addresses.
- Enable provider backups and take consistent application-level SQLite backups.
  Verify restore and keep an additional copy off-host.
- Configure a real domain, external readiness monitoring, disk alerts, and bounded
  container logs before inviting users.

The currently listed Basic 2 GiB plan is **USD $12/month**. Percentage-based daily
backups add **30%**, making that combination approximately **USD $15.60/month**,
excluding taxes, domain registration, optional off-host backup storage, and usage
beyond included allowances. Check the account's checkout quote before purchasing.
Sources: [Droplet pricing](https://www.digitalocean.com/pricing/droplets),
[backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/).

## Why a Droplet

App Platform's filesystem is ephemeral and it does not provide persistent volumes
for this SQLite design. A redeploy would lose a local database there. A Droplet
lets the existing single-instance service keep its database on durable local disk.
If the project later moves to an external managed database and stateless instances,
App Platform can be reconsidered.
[DigitalOcean storage guidance](https://docs.digitalocean.com/products/app-platform/how-to/store-data/).

Public container images fit the open-source setup. GHCR lets contributors pull the
same application build used in deployment; DigitalOcean's own registry is private.
The prepared release workflow builds and tests images, while publication requires
a deliberate release/manual action. Registry visibility and first publication
still need to be configured by the repository owner.
[DigitalOcean registry overview](https://docs.digitalocean.com/products/container-registry/getting-started/quickstart/).

## Information still required

1. Approved monthly budget and backup preference.
2. DigitalOcean account/team access through the normal authenticated flow.
3. Preferred region and the domain/subdomain to use.
4. Operator SSH public key and allowed management IP ranges.
5. A tested image digest and a repository owner-approved publishing destination.

The deployment artifacts and operations checklist are in
[DEPLOYMENT.md](DEPLOYMENT.md). Provisioning should follow only after these inputs
and the concrete cost are approved. This deployment serves paper trading; connecting
a real Solana wallet does not turn the paper service into on-chain settlement.
