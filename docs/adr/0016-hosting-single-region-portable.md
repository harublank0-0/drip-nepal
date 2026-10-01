# ADR-0016: Hosting: single region near Nepal, Docker on one VPS + managed PostgreSQL + object storage/CDN

Status: Draft v1 (2026-09-25)

Reviewed: critic pass A4.3 (2026-09-25)

## Status

| Field              | Value                                                                                                                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision status    | **Proposed.** Blocked on **VX-09** (does DCCS Directive 2081 cl. 8(1) bind private clients?) and **OD-09** (production provider and region). Development and staging proceed on the provisional choice. The portability requirement (Decision 3, NFR-DATA-005) is binding now. No compliance claim is made for any option. |
| Date               | 2026-09-25                                                                                                                                                                                                                                                                                                                 |
| Deciders           | Lead developer; legal counsel (VX-09); the product owner approves running cost                                                                                                                                                                                                                                             |
| Supersedes         | —                                                                                                                                                                                                                                                                                                                          |
| Superseded by      | —                                                                                                                                                                                                                                                                                                                          |
| Related open items | **VX-09**, **OD-09**, VX-15 (prices, latency, paying foreign invoices), VX-14 (static egress IP), OD-26 (e-invoicing), REG-32, R-08, R-09, R-29                                                                                                                                                                            |

## Context

**What must be hosted** (ADR-0002, ADR-0010, ADR-0013): one Docker image with `web` and `worker` processes; PostgreSQL 18 with point-in-time recovery as the only stateful service; S3-compatible object storage behind a CDN. It is run by 1–2 developers [Confirmed, Q1] for users in Nepal, many on slow mobile networks.

**Where data may live** [Verified-doc; applicability **Open, VX-09**]. DCCS Directive 2081 (<https://doit.gov.np/content/12100/data-center-and-cloud-service--operation-and/>; unofficial translation <https://giwmscdnone.gov.np/media/pdf_upload/data%20center%20translation_bhnhhri.pdf>, accessed 2026-09-25): cl. 3(1) cloud providers must be listed with DoIT; cl. 8(1) "any client" must use only listed providers, and "client" is undefined; cl. 8(2) a client must move if its provider is delisted; cl. 8(3) the client notifies NCSC when an unauthorised access needs forensic investigation. Law firms find no explicit offshore ban (<https://www.pradhanlaw.com/publications/data-center-and-cloud-service-operation-and-management-directive-2081-2025-ad>, accessed 2026-09-25). Separately, the Electronic Invoice Procedure 2082 requires invoicing servers in Nepal (<https://ird.gov.np/category/electronic-invoice/>, accessed 2026-09-25), relevant only if OD-26 makes DripNepal an e-invoice issuer.

**Provider facts** [Verified-doc, accessed 2026-09-25; prices as published on 2026-09-25, never extrapolated]:

- DigitalOcean BLR1 offers Droplets, Managed PostgreSQL and Spaces (<https://docs.digitalocean.com/platform/regional-availability/>). Managed PostgreSQL supports v18 with daily backups kept 7 days and 7-day PITR; a restore creates a new cluster, destroying a cluster destroys its backups, and the 1 GiB plan allows 22 connections (<https://docs.digitalocean.com/products/databases/postgresql/details/limits/>).
- Cloudflare lists a Kathmandu PoP (<https://www.cloudflare.com/network/>); whether Nepali ISPs are routed there is unverified. R2 egress is free, and `r2.dev` "is rate-limited and should only be used for development purposes" (<https://developers.cloudflare.com/r2/buckets/public-buckets/>).
- No latency has been measured from Nepali ISPs to any region, so "near" is geographic until benchmarked (VX-15). Every provider bills in USD or EUR by card; paying from Nepal is unconfirmed (VX-15).

## Decision

The topology diagram and environments are owned by [03 §5.1](../03-system-architecture.md#51-topology-adr-0016-provisional) and [03 §5.2](../03-system-architecture.md#52-environments); the connection budget by [03 §3.4](../03-system-architecture.md#34-postgresql-layout-and-connection-budget); RPO ≤ 15 min and RTO ≤ 4 h by NFR-AVAIL-002.

1. **Provisional topology** (OD-09 option a). Sizes are [Assumption] until memory use is measured.

   | Component       | Provisional choice                                                                                                         | Published price (2026-09-25)                                                        |
   | --------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
   | Production host | DigitalOcean BLR1 Droplet, 4 GB / 2 vCPU; Docker Compose runs the reverse proxy, `web`, `worker` and the release container | $24/mo (<https://www.digitalocean.com/pricing/droplets>)                            |
   | Database        | DigitalOcean Managed PostgreSQL 18, 1 GiB single node, private VPC, TLS                                                    | $15.15/mo on the pricing page vs "begin at $15.00" in the docs; confirm under VX-15 |
   | Staging         | Droplet 2 GB / 1 vCPU with a PostgreSQL 18.4 container                                                                     | $12/mo                                                                              |
   | Objects         | Cloudflare R2, private and public buckets per environment; `apac` hint is best effort, not residency                       | $0.015/GB-month, egress free (<https://developers.cloudflare.com/r2/pricing/>)      |
   | Edge            | Cloudflare DNS, proxy, CDN and WAF for the app domain and `media.<domain>`; never `r2.dev` in production                   | Plan not priced [Verify-external VX-15]                                             |

2. **Database and origin.** Core extensions only (`citext`, `pg_trgm`, `pgcrypto`). Because managed backups die with the cluster, an independent encrypted nightly dump goes to off-provider storage (NFR-DATA-004, R-29; retention owned by [11](../11-deployment-and-operations.md)). The cloud firewall admits 443 only from Cloudflare's published IP ranges; Cloudflare uses Full (strict) TLS; SSH is key-only; signed-in HTML and `/health/*` are never edge-cached [Assumption; owned by 11].
3. **Portability requirement** (binding now; NFR-DATA-005, [03 §5.3](../03-system-architecture.md#53-portability-requirement-nfr-data-005-vx-09)): one OCI image configured only by environment variables; vanilla PostgreSQL 18 with logical dumps that restore anywhere; objects only through `@adonisjs/drive`'s S3 service; no App Platform, Functions or Workers in the request path; DNS stays at Cloudflare, so moving the origin is a restore plus a record change.
4. **Nepal-hosting path.** If counsel reads cl. 8(1) as binding, production moves to a DoIT-listed provider (OD-09 option c). If OD-26 makes DripNepal an e-invoice issuer, invoice data moves to Nepal (option d). Either move is rehearsed with T-OPS-001 on the target first, and the incident runbook includes the cl. 8(3) NCSC step.

## Alternatives considered

Prices are as published on 2026-09-25 (VX-15 register and [research: infra-ops](../research/infra-ops.md)); they are inputs to OD-09, not quotes.

| Alternative                | Key facts                                                                                                   | Why not chosen now                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| DigitalOcean SGP1          | Same products and prices                                                                                    | **Kept as OD-09 option (b)** if the latency test favours it.                         |
| Akamai Chennai             | Compute, managed PostgreSQL 18 and object storage together; DB $16 (1 node) / $37 (3 nodes); 14-day backups | **Runner-up.** PITR granularity undocumented; included in the latency test.          |
| Render Singapore           | Compute from $7; bandwidth $0.15/GB; Pro workspace $25/mo                                                   | Higher cost; origin egress far dearer; static IPs expensive.                         |
| Railway Singapore          | Postgres "unmanaged", no documented PITR                                                                    | No managed PITR for order and payment data.                                          |
| Fly.io Mumbai / Singapore  | Managed Postgres only in `sin`, PostgreSQL 16–17 only                                                       | No PostgreSQL 18; a Mumbai app would use a Singapore database.                       |
| AWS Lightsail / RDS Mumbai | Lightsail DB lists PostgreSQL 12–16; RDS supports 18 with up to 35-day retention                            | Lightsail too old; RDS adds IAM/VPC work. Reconsider RDS if > 7 days PITR is needed. |
| Hetzner Singapore          | CPX22 €26.49/mo from 15 June 2026; no managed PostgreSQL                                                    | The team would own HA, PITR and restores.                                            |
| DoIT-listed Nepal provider | Not researched [Verify-external VX-15]                                                                      | **Not rejected**: OD-09 option (c).                                                  |

## Consequences

**Positive**

- About $51/mo for the production Droplet, database and staging as published on 2026-09-25, excluding the Cloudflare plan, email, error tracking and reverse-charge VAT (VX-05).
- Daily backups and 7-day PITR without a DBA; free media egress.
- Under the portability rules, a forced move is a restore and a DNS change, not a rewrite.

**Negative**

- One Droplet and one database node are single points of failure with no automatic failover; deploys restart containers.
- An adverse VX-09 answer may force a migration close to launch.

**Risks**

- _R-08, forced migration._ Mitigation: portability rules plus a T-OPS-001 restore on a second provider before launch.
- _Gateways or SMS require IP allow-listing (VX-14)._ The Droplet has a static IP.
- _Card payment of USD invoices fails_ (VX-15). Mitigation: confirm before M7.

## When to revisit

- Counsel's VX-09 opinion, or a DoIT or regulator notice; OD-26 makes DripNepal an e-invoice issuer; gateway onboarding requires DoIT-listed hosting.
- The latency test shows another region with median TTFB more than 20 % lower from at least two ISPs [Assumption].
- The [03 §13](../03-system-architecture.md#13-evolution-path-without-a-rewrite) triggers: database CPU above 60 % at peak for a week or connections near 22; web CPU above 70 % at peak.
- An outage or restore drill exceeds the NFR-AVAIL-002 RTO: add a database standby or a second web host.
- A listed price changes by more than 25 % when re-read at M7.

## Verification

- **Latency benchmark (VX-15, before OD-09 closes)**: test VMs in BLR1, SGP1 and Akamai Chennai; from NTC, Ncell, WorldLink and Vianet, record TCP connect, TLS and TTFB with `curl -w` (20 samples, 3 times a day, 3 days) and the `cf-ray` colo.
- **T-OPS-001 restore drill** before launch and quarterly [Assumption], plus a monthly dump-restore check ([11 §11.6](../11-deployment-and-operations.md#116-restore-drills-t-ops-001)): a PITR restore to a new cluster with staging smoke tests, and a restore of the nightly dump on a second provider (R-08; T-OPS-004 in [11 §1.9](../11-deployment-and-operations.md#19-portability-check-adopts-the-03-53-assumption)); measured RTO and RPO recorded in 11.
- **CI portability checks**: CI runs on `postgres:18.4` and MinIO; a migration lint rejects extensions outside the allow-list (T-ARCH-034, proposed); T-ARCH-001 forbids provider SDKs outside adapters.
- **Edge checks** ([11 §3.8](../11-deployment-and-operations.md#38-how-the-network-design-is-verified)): a direct request to the origin IP fails (T-OPS-007, proposed); `r2.dev` is disabled on production buckets (T-OPS-008, proposed).
- **Monthly cost review** against the table; prices re-read at M7.

## Related

- [03 §5 deployment](../03-system-architecture.md#5-deployment), [Deployment and operations](../11-deployment-and-operations.md)
- [01 §8.3 availability](../01-product-requirements.md#83-availability-and-recovery-nfr-avail), [01 §8.7 data](../01-product-requirements.md#87-data-nfr-data)
- [Risks and open decisions: OD-09, VX-09, VX-15, R-08](../risks-and-open-decisions.md#22-decision-table)
- [ADR-0002](0002-modular-monolith-adonisjs.md), [ADR-0010](0010-postgres-jobs-pg-boss-transactional-send.md) (connection budget), [ADR-0011](0011-schema-rebaseline-before-production.md), [ADR-0013](0013-media-direct-upload-async-processing.md)
