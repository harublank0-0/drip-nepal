# Deploying DripNepal

**Nothing is deployed.** No server runs DripNepal, and no database holds anything but seed data (status of 2026-11-07, [risks §2.3](docs/risks-and-open-decisions.md#23-decision-log), OD-55). There is nothing to deploy yet either: the single-seller v1 store that this file used to describe was removed with the M0 schema baseline ([ADR-0011](docs/adr/0011-schema-rebaseline-before-production.md)), and the storefront, seller dashboard and admin pages come back as milestones M1 to M7 rebuild them ([docs/12](docs/12-roadmap-and-backlog.md)). Rewritten 2026-11-09.

## The target deployment

[docs/11](docs/11-deployment-and-operations.md) owns it. Start with:

- [§1](docs/11-deployment-and-operations.md#1-recommended-cost-conscious-deployment): the recommended host and what is still open (OD-09 and VX-09 block the production choice).
- [§2](docs/11-deployment-and-operations.md#2-environments-and-data-policy): development, CI, staging and production, and which data each may hold.
- [§4](docs/11-deployment-and-operations.md#4-docker-images-and-local-setup): the image, the development Compose file and the staging and production Compose.
- [§5](docs/11-deployment-and-operations.md#5-cicd-and-release-promotion): the pipeline, versioning, the deploy step and [§5.9](docs/11-deployment-and-operations.md#59-first-deploy-of-an-environment), the first deploy of an environment.
- [§6](docs/11-deployment-and-operations.md#6-safe-schema-migrations) to [§11](docs/11-deployment-and-operations.md#11-backup-policy-and-verified-restore): migrations, health checks, jobs, observability, runbooks, backups and restore drills.

The first deploy of any environment also follows the bootstrap checklist of [docs/09 §9.3](docs/09-code-structure-and-engineering-standards.md#93-bootstrap-checklist-first-deploy-of-an-environment), whose first platform admin comes from `node ace platform:create-admin` (epic E8, not built yet).

## What is in the repository today

`Dockerfile`, `docker-compose.prod.yml`, `docker/Caddyfile`, `docker/entrypoint.sh` and `.env.production.example` are the prototype's single-server files. They are not a supported deployment: epic E6 rewrites the image to [docs/11 §4.2](docs/11-deployment-and-operations.md#42-dockerfile), and the Compose files of [docs/11 §4.5](docs/11-deployment-and-operations.md#45-staging-and-production-compose) replace the rest. Don't put a server on them.

## What runs now

Only a local development setup:

- [README.md](README.md#running-it-locally): install, the local database, migrations, reference data and `pnpm dev`. M0 brings it to the five commands of [docs/11 §4.4](docs/11-deployment-and-operations.md#44-local-setup-in-five-commands).
- The `dripnepal-run` skill (`.agents/skills/dripnepal-run/`): what the app serves today (`/design-system` in development, `/health/live`, `/health/ready`) and how to check a production build locally.
- The `dripnepal-testing` skill: the test database and the suites.
