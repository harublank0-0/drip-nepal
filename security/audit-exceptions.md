# Advisory exceptions

The advisories that `pnpm audit --prod --audit-level high` ignores ([docs/09 §10.3](../docs/09-code-structure-and-engineering-standards.md#103-update-cadence-and-advisories), [docs/07 §7.1](../docs/07-security-threat-model-and-permissions.md#71-dependency-policy)). pnpm reads the IDs from `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml`, which has no expiry field, so each ignored advisory also gets a row here with its reason, who accepted it and an expiry date.

`T-SEC-038` (`scripts/check_audit_exceptions.mjs`, run in CI's Supply chain job) fails when an ID is in one place and not the other, when `auditConfig` holds any key but `ignoreGhsas`, when a row has no package or reason, when its "Accepted by" cell is empty or starts with "Pending", or when its expiry date has passed. An expired exception is fixed by updating the package or by a new, dated acceptance.

**There are no exceptions** (2026-11-16), so `pnpm-workspace.yaml` has no `auditConfig` block. The last two, for `nodemailer` 9 (GHSA-v53p-9fqp-m79j and GHSA-prgh-xp8r-p3m5), went when `@adonisjs/mail` was removed until M1, because no code sends email yet. M1 re-added it on 2026-11-22 as 10.4.1, which needs `nodemailer ^10.2.1`, past both advisories, so neither exception came back. GHSA-mrhx-c7xc-m3w5, for the `zod` 3 copy that `shadcn` pulled in, went when `shadcn` moved to the devDependencies. A new exception adds both an `ignoreGhsas` entry and a row here, accepted by name and date.

| GHSA | Package | Reason | Accepted by | Expires (YYYY-MM-DD) |
| ---- | ------- | ------ | ----------- | -------------------- |
