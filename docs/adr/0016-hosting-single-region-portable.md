# ADR-0016: Hosting: single region near Nepal, Docker on one VPS + managed PostgreSQL + object storage/CDN

Status: Draft v1 (2026-09-25)

## Status

| Field | Value |
|---|---|
| Decision status | **Proposed.** Blocked on **VX-09** (does DCCS Directive 2081 cl. 8(1) bind private clients?) and **OD-09** (production provider and region). Development and staging proceed on the provisional choice. The portability requirement (Decision 4) is binding now. This ADR makes no compliance claim for any option. |
| Date | 2026-09-25 |
| Deciders | Tech lead (lead developer) and legal counsel (VX-09). The product owner approves the running cost. |
| Supersedes | — |
| Superseded by | — |
| Related open items | **VX-09**, **OD-09**, OD-26 (e-invoicing), VX-15 (hosting prices, regions, latency), VX-14 (static egress IP); risks R-08, R-09 |

## Context

**What must be hosted** (ADR-0002, ADR-0010, ADR-0013):
- one Docker image with two process types, `web` and `worker`;
- PostgreSQL 18 with PITR, which is the only stateful service;
- S3-compatible object storage with a CDN.

It is run by 1–2 developers for users in Nepal, many of them on slow mobile networks.

**Where data may live** [Verified-doc; applicability **Open, VX-09**]. Source: DCCS Directive 2081, https://doit.gov.np/content/12100/data-center-and-cloud-service--operation-and/ and the unofficial translation https://giwmscdnone.gov.np/media/pdf_upload/data%20center%20translation_bhnhhri.pdf, accessed 2026-09-25.
- Cl. 3(1): cloud providers must be listed with the Department of Information Technology (DoIT).
- Cl. 8(1): "any client" must use only listed providers, and "client" is not defined.
- Cl. 8(2): a client must move if its provider is delisted.
- Cl. 8(3): the client notifies the National Cyber Security Center (NCSC) when an unauthorised access needs forensic investigation.

Law firms find no explicit offshore ban but say clients must use DoIT-enrolled providers (https://www.pradhanlaw.com/publications/data-center-and-cloud-service-operation-and-management-directive-2081-2025-ad, accessed 2026-09-25).

Separately, the Electronic Invoice Procedure 2082 s7 requires invoicing servers to be in Nepal, with a Nepal-registered cloud provider and a tripartite agreement (https://ird.gov.np/category/electronic-invoice/, accessed 2026-09-25). That applies only if OD-26 makes DripNepal an e-invoice issuer.

**Provider facts** [Verified-doc, `infra_ops` research, accessed 2026-09-25]:
- **DigitalOcean BLR1** has Droplets, Managed PostgreSQL and Spaces (https://docs.digitalocean.com/platform/regional-availability/).
- **DigitalOcean Managed PostgreSQL** (https://docs.digitalocean.com/products/databases/postgresql/details/limits/):
  - supports v18, with daily backups kept 7 days and 7-day PITR;
  - a restore creates a new cluster, and destroying a cluster destroys its backups;
  - the 1 GiB plan allows 22 connections.
- **Cloudflare** lists a Kathmandu PoP (https://www.cloudflare.com/network/). Whether Nepali ISPs are actually served there is unverified.
- **R2** egress is free. `r2.dev` access "is rate-limited and should only be used for development purposes", while a custom domain enables Cloudflare Cache and WAF rules (https://developers.cloudflare.com/r2/buckets/public-buckets/).
- **Latency and billing.** No latency measurements from Nepali ISPs exist for any region, so "near" is geographic until benchmarked (VX-15). Every provider bills in USD or EUR by card; the product owner must confirm the company can pay [Assumption: payable].

## Decision

1. **Provisional topology** (diagram in [docs/03 §5](../03-system-architecture.md)). Prices are as published on 2026-09-25. Sizes are [Assumption] until memory use is measured.

   | Component | Provisional choice | Published price |
   |---|---|---|
   | Production host | DigitalOcean BLR1 Basic Droplet, 4 GB / 2 vCPU. Docker Compose runs the reverse proxy, `web`, `worker` and the one-off release container. | $24/mo; overage $0.01/GiB |
   | Database | DO Managed PostgreSQL 18, 1 GiB single node, private VPC, TLS | $15.15/mo on the pricing page vs "begin at $15.00" in the docs (VX-15) |
   | Staging | Droplet 2 GB / 1 vCPU with a PostgreSQL 18.4 container | $12/mo |
   | Objects | Cloudflare R2, private and public buckets per environment, `apac` hint (best effort, not residency) | $0.015/GB-month; egress free |
   | Edge | Cloudflare DNS, proxy, CDN and WAF for the app domain and a media custom domain; never `r2.dev` in production | Plan not priced [Verify-external VX-15] |

2. **Database settings.**
   - Connections per canon §6.1: web 8, worker 4, pg-boss 4 (direct, never through a transaction-mode pool), admin 2, headroom 4.
   - Core extensions only (`citext`, `pg_trgm`, `pgcrypto`).
   - Because managed backups die with the cluster, a nightly encrypted `pg_dump` goes to an off-provider R2 bucket that only the backup job can write to, kept 35 days [Assumption; RPO and RTO targets are owned by [docs/11](../11-deployment-and-operations.md)].
3. **Origin hardening.**
   - The DigitalOcean cloud firewall admits 443 only from Cloudflare's published IP ranges. This stops attackers bypassing the WAF through the origin IP; the cost is keeping the range list current.
   - Cloudflare connects in Full (strict) mode with an origin certificate.
   - SSH is key-only.
   - Signed-in HTML and `/health/*` are never edge-cached.
4. **Portability requirement** (binding; mitigates R-08). No provider-only feature is allowed in the request path or the data model:
   - one OCI image, configured only by environment variables;
   - vanilla PostgreSQL 18, backed up in formats that restore anywhere (pgBackRest supports PG 18 for self-managed hosts [Verified-doc, https://pgbackrest.org/release.html]);
   - objects only through `@adonisjs/drive`'s S3 service;
   - no App Platform, Functions or Cloudflare Workers in the request path;
   - DNS stays at Cloudflare, so moving the origin means a restore plus a record change.
5. **Nepal-hosting path.**
   - If counsel reads cl. 8(1) as binding, production moves to a DoIT-listed provider (OD-09 option c).
   - If OD-26 makes DripNepal an e-invoice issuer, the invoicing component moves behind the `InvoiceIssuer` adapter (option d).
   - Either move is rehearsed with T-OPS-001 on the target first.
   - The incident runbook includes the cl. 8(3) NCSC step (docs/11).

## Alternatives considered

All prices are as published on 2026-09-25 [Verified-doc, `infra_ops` research].

| Alternative | Key facts | Why not chosen now |
|---|---|---|
| DigitalOcean SGP1 | Same products; same bandwidth pricing | **Kept as OD-09 option (b)** if the latency test favours it. |
| Render Singapore | Compute $7 (0.5c-512mb) / $25 (1c-2g); Postgres $19 (0.5c-1g); Pro workspace $25/mo; bandwidth $0.15/GB; dedicated IPs $100/mo | Costs more than one Droplet. Origin egress is 15× DigitalOcean's. A static IP is expensive. |
| Railway Singapore | Pro $20 incl. usage; RAM $10/GB, CPU $20/vCPU per month; Postgres "unmanaged", no documented PITR | No managed PITR for order and payment data. |
| Fly.io Mumbai / Singapore | Region markup 3× (bom) and 2× (sin); MPG $38/mo, only in `sin`; PostgreSQL 16–17 only | No PostgreSQL 18. A Mumbai app would use a Singapore database. |
| AWS Lightsail Mumbai | DB 1 GB $15 ($30 HA); egress overage $0.1093/GB | The docs list PostgreSQL 12–16 only. |
| AWS RDS Mumbai | PG 18.1+; retention up to 35 days; db.t4g.micro $0.021/hr Single-AZ | More to operate (IAM, VPC). Reconsider if more than 7 days of PITR is required. |
| Akamai Chennai | Compute, managed DB and object storage together; DB $16 (1 node) / $37 (3 nodes); PG 18; 14-day backups | **Runner-up**: the cheapest HA found. PITR granularity is undocumented. Included in the latency test. |
| Hetzner Singapore | CPX22 €26.49 ($30.99) from 15 June 2026; no managed PostgreSQL | The team would own HA, PITR and restores. |
| DoIT-listed Nepal provider | Capabilities and prices not researched [Verify-external VX-15] | **Not rejected**: OD-09 option (c). |

## Consequences

**Positive**
- About $51/mo of listed items (production Droplet, database and staging), as published on 2026-09-25. This excludes the Cloudflare plan, email, error tracking and reverse-charge VAT (VX-05).
- Daily backups and 7-day PITR without a DBA; free media egress.
- Under the portability rules, a forced move is a restore and a DNS change, not a rewrite.

**Negative**
- One Droplet and one database node are single points of failure, with no automatic failover. Deploys restart containers.
- If VX-09 goes against offshore hosting, migration may land close to launch.

**Risks**
- *R-08, forced migration.* Mitigation: the portability rules, plus a T-OPS-001 restore on a second provider before launch.
- *Gateways or SMS require IP allow-listing (VX-14).* The Droplet has a static IP, one reason a PaaS was not chosen.

## When to revisit

- Counsel's VX-09 opinion, or a DoIT or regulator notice.
- OD-26 makes DripNepal an e-invoice issuer, or gateway onboarding (M8) requires DoIT-listed hosting.
- The latency test shows another region with a median TTFB more than 20 % lower from at least two ISPs [Assumption].
- At peak, Droplet memory stays above 80 %, or database connections above 18 or CPU above 60 % (ADR-0010).
- An outage exceeds the RTO target. Then add a database standby or a second web host.
- A listed price changes by more than 25 %.

## Verification

- **Latency benchmark (VX-15, before OD-09 closes).**
  - Test VMs in BLR1, SGP1 and Akamai in-maa.
  - From NTC, Ncell, WorldLink and Vianet, record TCP connect, TLS and TTFB (`curl -w`): 20 samples, 3 times a day, over 3 days.
  - Record the `cf-ray` colo to see whether Kathmandu serves each ISP.
- **T-OPS-001 restore drill**, before launch and quarterly [Assumption]:
  - a PITR restore to a new cluster, with staging smoke tests against it;
  - a restore of the nightly dump on a second provider (the R-08 rehearsal);
  - measured RTO and RPO recorded in docs/11.
- **Portability checks in CI.**
  - CI uses vanilla `postgres:18.4` and MinIO.
  - A migration lint rejects extensions outside the allow-list.
  - T-ARCH-001 forbids provider SDKs outside adapters.
- **Edge checks (T-OPS area).**
  - A direct request to the origin IP from outside Cloudflare fails.
  - `r2.dev` is disabled on production buckets.
- **Monthly cost review** against the table. Re-read the published prices at M7.

## Related

- [Architecture §5: topology, environments, portability](../03-system-architecture.md)
- [Deployment and operations](../11-deployment-and-operations.md)
- [Risks and open decisions: OD-09, OD-26, VX-09, VX-15, R-08](../risks-and-open-decisions.md)
- ADR-0002, ADR-0010 (connection budget), ADR-0011, ADR-0013
