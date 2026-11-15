<!-- docs/09 §11.5. Delete nothing; write "n/a" where a line does not apply. -->

**What and why**

<!-- One paragraph. Link the FR / J / OD / RF IDs and the milestone. -->

Closes DRIP-NN <!-- or say why there is no Linear issue (docs/09 §11.6) -->

**Evidence**

- [ ] Tests added or changed (IDs: …); CI green
- [ ] Screenshots or a short video for UI changes (mobile width first)

**Fable review** (docs/09 §11.5)

<!-- A Fable-model reviewer reviewed the final commit before this pull request was opened. List each finding with its outcome: fixed (commit), or not a defect (why). -->

- Reviewed commit: …
- Findings and outcome: …

**Checklist (tick or write "n/a")**

**Security and privacy**

- [ ] Every new seller/admin route declares a permission; cross-shop and cross-customer access returns 404 (T-SEC-001, T-SEC-002)
- [ ] Inputs validated with an allowlist schema; no mass assignment; client prices, totals, shop_id and commission rejected with 422 VALIDATION_FAILED (unknown_field) (T-SEC-003)
- [ ] No personal data, tokens or secrets in logs, props, error bodies or job payloads (09 §7.2)

**Migrations**

- [ ] One concern per file; applied migrations untouched; lock updated (09 §8.4)
- [ ] Safe while the previous release runs (expand/contract, 09 §8.5); contract step links its expand PR
- [ ] database/schema.ts regenerated, not edited; constraint names as in 04a

**Money and stock**

- [ ] Integer paisa only; sums through sumMinor; no parseFloat/toFixed (ADR-0007)
- [ ] Stock and state changes use casStatus / row locks in the 05 lock order, inside one withTx

**Idempotency and jobs**

- [ ] Operations on the ⚷ list of 06 §7.7 require Idempotency-Key and replay correctly; a new operation that moves orders, stock or money is added to that list
- [ ] Jobs are idempotent, sent in the same transaction, payload keys snake_case with request_id
- [ ] No provider call inside a transaction

**Accessibility and UI**

- [ ] Keyboard path, visible focus, labels, 24 px targets; axe clean on touched pages (T-A11Y-001)
- [ ] Strings from catalogs; money via formatNPR; works without JavaScript where 08 requires it

**Dependencies and docs**

- [ ] New dependency justified (need, licence, maintenance, size, install scripts – 09 §10.1)
- [ ] A lockfile change comes with package.json or pnpm-workspace.yaml, or the PR is labelled `dependencies` (T-SEC-026)
- [ ] Docs updated where behaviour changed (FR/AC, 06 endpoint table, openapi.yaml)
- [ ] Does this change a decision listed in docs/adr? If yes, link the new or superseding ADR.
- [ ] New or changed queries in queries.ts include EXPLAIN (ANALYZE, BUFFERS) on seeded data (04 §17)
