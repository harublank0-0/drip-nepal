# ADR-0001: Record architecture decisions

Status: Draft v1 (2026-09-25)

Reviewed: critic pass A4.3 (2026-09-25)

## Status

| Field           | Value                         |
| --------------- | ----------------------------- |
| Decision status | **Accepted**                  |
| Date            | 2026-09-25                    |
| Deciders        | Product owner, lead developer |
| Supersedes      | —                             |
| Superseded by   | —                             |
| Blocking items  | none                          |

Edited 2026-09-30 (consistency review): the Context line on the seller prefix records that OD-12 was decided; the decision is unchanged.

## Context

DripNepal is built by 1–2 developers on a small budget [Confirmed, Q1]. With so few people, the reason behind a decision usually lives in one person's head or in a pull-request thread. The repository already shows the cost ([00 §4.6](../00-context-assumptions-and-questions.md#46-consolidated-repository-findings-rf-01--rf-47)):

- **Decisions reversed without a record.** Commit `0282605` moved the vendor dashboard from `/vendors/dashboard` to `/shop/:shopSlug/dashboard` without updating callers, which broke vendor registration (RF-03). The plan now moves it to `/seller/{shopSlug}` (OD-12, decided 2026-09-30). The first change had no written rationale, so the second cannot be checked against it [Verified-repo, `start/routes/shops.ts:11`].
- **Documentation and code disagree.** `database/README.md` names pivot tables the migrations never create (RF-20), and the README contradicts the code on stack, licence and status (RF-42) [Verified-repo].
- **History was rewritten.** Applied migrations were edited in place (RF-41), so nobody can tell which schema choices were deliberate.

This documentation set makes decisions that are expensive to reverse: money representation, tenancy, session store, job backend, hosting region, URL scheme and error contract. They need a durable "why", separate from the "what" in the specification documents ([03](../03-system-architecture.md), [04](../04-domain-model-and-data-dictionary.md), [06](../06-api-design.md)).

MADR (Markdown Architectural Decision Records) is a lightweight template whose sections include Context and Problem Statement, Considered Options, Decision Outcome, Consequences and Confirmation; most are optional [Verified-doc, https://adr.github.io/madr/, accessed 2026-09-25].

## Decision

We record architecture decisions as ADRs in `docs/adr/`, using a trimmed MADR layout.

1. **Location and naming.** One file per decision, `docs/adr/NNNN-kebab-title.md`, numbered from 0001. Numbers are never reused. The [index](README.md) lists every ADR.
2. **Required sections**, in order: Status, Context, Decision, Alternatives considered, Consequences (positive, negative, risks), When to revisit, Verification, Related. MADR's "Considered Options" maps to _Alternatives considered_ and "Confirmation" to _Verification_. _When to revisit_ is added because a small team needs explicit triggers instead of periodic reviews.
3. **Status values.** `Proposed` (depends on an open OD-xx or VX-xx, named in the Status table), `Accepted`, `Deprecated`, `Superseded by ADR-NNNN`.
4. **Immutability.** Once Accepted, Context, Decision and Alternatives are not rewritten; a changed decision gets a new, superseding ADR. In-place edits are limited to typos, link repairs, status changes and new _Verification_ entries.
5. **Labels.** ADRs use the evidence labels of [00](../00-context-assumptions-and-questions.md): [Confirmed], [Verified-repo], [Verified-doc], [Assumption], [Open] OD-xx, [Verify-external] VX-xx. External facts cite a URL and access date; prices are written "as published on <date>".
6. **Ownership split.** An ADR records the decision and its reason, and links to the owning document for detail. Example: ADR-0007 decides "integer paisa"; the columns live in [04 §2.3](../04-domain-model-and-data-dictionary.md#23-money).
7. **When an ADR is required.** A pull request needs a new or superseding ADR when it changes money or ledger rules (ADR-0007, ADR-0009); tenancy, authorization or authentication (ADR-0005, ADR-0006); adds a stateful service such as Redis or a search engine (ADR-0002, ADR-0010, ADR-0014); adds or replaces an external provider (ADR-0012, ADR-0013, ADR-0016); changes the public URL scheme, API versioning or error contract (ADR-0004, ADR-0017, ADR-0018); changes the migration policy (ADR-0011); adds a UI registry or component source (ADR-0015); or weakens a security control such as CSP or CSRF on a route. Library patch upgrades, new shadcn primitives within ADR-0015 and new endpoints that follow ADR-0004 need no ADR.
8. **Workflow.** An ADR arrives as `Proposed` in or before the first PR that depends on it. The other developer reviews it; with one developer, the product owner acknowledges it in the PR. When every blocking OD/VX in the [risk register](../risks-and-open-decisions.md) is closed, the status moves to Accepted.

## Alternatives considered

| Alternative                                                   | Why rejected                                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| No ADRs; rationale in PR descriptions and chat                | Not findable after merge, not versioned with the docs. RF-03, RF-20 and RF-42 show the cost.                                 |
| Wiki or Notion outside the repository                         | Drifts from code, is not reviewed in the same PR, and needs extra tool access per contributor.                               |
| Nygard's four-section format                                  | No _Verification_ (decisions not tied to CI checks) and no _When to revisit_ (thresholds such as ADR-0014's would get lost). |
| Full MADR with pros/cons per option and decision-driver lists | Doubles writing time for 1–2 developers; a table of alternatives with the rejection reason gives most of the value.          |
| ADR tooling (adr-tools, log4brains)                           | A dependency for about 20 files; plain Markdown plus a CI heading check is enough.                                           |

## Consequences

**Positive**

- A new developer can learn why the system looks the way it does from 18 short files.
- Each decision carries its own revisit triggers, so the team reacts to measured conditions.
- Proposed ADRs make external blockers (OD-02, VX-09, VX-13) visible next to the design that depends on them.

**Negative**

- An ADR costs about 30–60 minutes of scarce developer time [Assumption].
- Superseding instead of editing lengthens history; readers must follow "Superseded by" links.

**Risks**

- _ADR rot_: code changes, ADR is not superseded. Mitigation: every ADR names the tests or CI checks that enforce it, so removing them shows in the PR diff.
- _Status drift_: a Proposed ADR outlives its OD. Mitigation: the milestone exit review in [12 §2.4](../12-roadmap-and-backlog.md#24-definition-of-done) (item 3) compares ADR statuses with the OD/VX register.

## When to revisit

- More than 50 ADRs, or more than 5 active contributors: consider generated indexes or decision-log tooling.
- Two consecutive milestones merge architecture-relevant PRs without adding or updating an ADR: review whether Decision item 7 is followed.
- DripNepal adopts a company-wide documentation platform for engineering records.

## Verification

- **CI docs check** (T-ARCH-029, proposed; registered in [10 §6.2](../10-testing-and-quality-gates.md#62-architecture-schema-and-repository-t-arch)): validates Markdown links; checks every `docs/adr/NNNN-*.md` has the eight required `##` headings; fails on duplicate numbers or an ADR missing from `README.md`.
- **PR template checkbox**: "Does this change a decision listed in docs/adr? If yes, link the new or superseding ADR."
- **Milestone exit review** ([12 §2.4](../12-roadmap-and-backlog.md#24-definition-of-done), item 3): ADR statuses match the OD/VX register (for example, ADR-0011 became Accepted when OD-01 was decided on 2026-09-30).

## Related

- [ADR index](README.md)
- [Context, assumptions and questions (labels, RF findings)](../00-context-assumptions-and-questions.md)
- [Risks and open decisions (OD/VX registers)](../risks-and-open-decisions.md)
- [Roadmap and backlog](../12-roadmap-and-backlog.md) · [Testing and quality gates](../10-testing-and-quality-gates.md)
