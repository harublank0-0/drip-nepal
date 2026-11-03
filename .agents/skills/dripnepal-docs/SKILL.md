---
name: dripnepal-docs
description: Finds the DripNepal document and section that owns a fact (an API operation, error code, table or column, state transition, permission or status gate, test ID, milestone, open decision, setting or assumption) and explains how to change the docs correctly. Use before implementing or reviewing a feature, when code and docs disagree, when a question is about how DripNepal should behave, or when editing anything under docs/.
user-invocable: true
---

# DripNepal docs

The documents in `docs/` are the source of truth for the target system. Each fact has one owning document; the others link to it. Read the owner, not a restatement. The documents are long (`04a` and `09` are over 3,000 lines each), so read by section: list the headings first, then read the section you need.

```bash
grep -n '^#' docs/06-api-design.md            # headings of one document
grep -n '`placeOrder`' docs/*.md docs/openapi.yaml   # every mention of a name
```

## 1. Find the owner

| You need…                                                        | Owner and where                                                                                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A requirement and its release                                    | `docs/01-product-requirements.md`: FR-xx / NFR-xx sections; release scope §5                                                                       |
| A user flow and its acceptance criteria                          | `docs/02-user-journeys-and-acceptance-criteria.md`: J-01 to J-20, AC-Jxx-nn                                                                        |
| Modules, what a module owns and may import, jobs and queues      | `docs/03-system-architecture.md`: §4 (modules), §9 (jobs), §10 (job rules); code rules in `docs/09` §2                                             |
| A table, column, constraint, index or enum value                 | `docs/04a-data-dictionary-tables.md` (one section per table); conventions, invariants (INV-xx), money and retention in `docs/04`                   |
| A setting key and its default                                    | `docs/04a` §15.1 (`platform_settings`)                                                                                                             |
| A state, a transition, or what it does to money and stock        | `docs/05-order-payment-and-inventory-lifecycles.md`                                                                                                |
| An operation: path, permission, inputs, outputs, errors, effects | `docs/06-api-design.md` §13 (one table row per operationId), schemas in `docs/openapi.yaml`                                                        |
| An error code and its HTTP status                                | `docs/06` §5.2 (codes), §5.3 (database errors to HTTP)                                                                                             |
| Idempotency keys, ETags and `If-Match`                           | `docs/06` §7 and §8                                                                                                                                |
| Who may do it, and in which shop status                          | `docs/07-security-threat-model-and-permissions.md` §4.2–§4.3 (role maps), §4.4 (status gates), §4.5 (operation → permission)                       |
| Session, step-up, privacy, encryption, masking, incident rules   | `docs/07` §3, §5, §6                                                                                                                               |
| A page, its route, props and components                          | `docs/08-ui-ux-and-design-system.md` §2 (route map), §3 (screens by release), §4 (components), §5 (tokens)                                         |
| Where code goes and how it is written                            | `docs/09-code-structure-and-engineering-standards.md` (§1 tree, §2 modules, §3 layers, §5 errors, §8 migrations, §12 worked example, §13 frontend) |
| The test that proves a behaviour                                 | `docs/10-testing-and-quality-gates.md` §6 (test ID registry); CI gates §5                                                                          |
| Local setup, releases, jobs operations, alerts, runbooks         | `docs/11-deployment-and-operations.md`                                                                                                             |
| When something is built                                          | `docs/12-roadmap-and-backlog.md` §3 (milestones), §4 (M0), §5 (M1 to M9 scope and exit criteria)                                                   |
| Whether something is decided, and what blocks a milestone        | `docs/risks-and-open-decisions.md` §2 (OD-xx), §3 (VX-xx), §5 (blockers by milestone); decision log §2.3                                           |
| Why the design is the way it is                                  | `docs/adr/` (ADR-0001 to ADR-0018; index in `docs/adr/README.md`)                                                                                  |
| What an ID or label means; assumptions A-xx; known code defects  | `docs/00-context-assumptions-and-questions.md` §1.2 (labels), §1.3 (IDs), §4.6 (RF-xx), §6 (A-xx)                                                  |

## 2. Trace a feature end to end

1. Requirement: the FR in `01`, and its release.
2. Journey: the J-xx in `02` and its acceptance criteria (the ACs are what the tests check).
3. Rules: the transitions, money and stock effects in `05`.
4. Data: the tables in `04a`, the invariants in `04` §16.
5. API: the operation rows in `06` §13 and their schemas in `openapi.yaml`.
6. Access: the permission and status gate in `07` §4.4–§4.5.
7. Tests: the IDs in `10` §6 that the rows cite.
8. Schedule: the milestone in `12` that builds it, and the open decisions in `risks` §5 that block it.

## 3. Read the marks correctly

| Mark                                            | Meaning                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| ⚷                                               | The operation needs an `Idempotency-Key` (`06` §7.7)                                                     |
| ⟳                                               | The operation needs `If-Match` with the strong ETag `"<version>"` (`06` §8)                              |
| (proposed)                                      | A name not yet approved: an operation, code, column or audit action, or a non-base test ID               |
| base (10 §6)                                    | One of the base test IDs                                                                                 |
| [Assumption A-xx]                               | A default you build to and keep configurable (`00` §6)                                                   |
| [Open OD-xx]                                    | Undecided; never hard-code it (`risks` §2)                                                               |
| [Verify-external VX-xx]                         | An external fact not yet confirmed; never shown to users as fact (`risks` §3)                            |
| [Confirmed], [Verified-repo], [Verified-doc]    | Product-owner answer, checked in this repository, checked in official documentation (`00` §1.2)          |
| "Edited YYYY-MM-DD" in an ADR                   | A dated correction to an Accepted ADR, allowed before the first production release (ADR-0001 decision 4) |
| "Done in the consistency review, 2026-09-30: …" | A closed item in a document's Consistency notes                                                          |

## 4. Change the docs correctly

1. Change the **owner** first. Then update every document that restates or links to the fact: `grep` for the name across `docs/`.
2. Change `06` and `openapi.yaml` together. Every operation in `06` §13 is either specified in `openapi.yaml` paths or listed in its `x-pending-operations`.
3. Register what you introduce: a test ID in `10` §6, an open decision in the risks register, an assumption in `00` §6. Keep "(proposed)" on a name until it is approved or implemented.
4. Accepted ADRs: add a dated "Edited YYYY-MM-DD" note next to the changed text (before the first production release); never rewrite the decision silently.
5. Record the change, and anything still open, in the document's Consistency notes.
6. Keep the repository self-contained: relative links only, no absolute paths, nothing that points outside the repository. Check that every `#anchor` you link exists (GitHub slug: lowercase, punctuation dropped except hyphens, spaces to hyphens).
7. Put identifiers in backticks and run `pnpm format` (or `npx prettier --check docs`) before committing; Prettier rewraps tables.

## 5. When code and docs disagree

The docs describe the target and win by default. If the doc is wrong, fix the owner in the same pull request as the code. If the change is a decision the product owner or tech lead must make, record it as an OD in the risks register instead of choosing silently.
