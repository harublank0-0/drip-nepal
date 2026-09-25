# ADR-0001: Record architecture decisions

Status: Draft v1 (2026-09-25)

## Status

| Field | Value |
|---|---|
| Decision status | **Accepted** |
| Date | 2026-09-25 |
| Deciders | Product owner, lead developer |
| Supersedes | — |
| Superseded by | — |
| Blocking items | none |

## Context

DripNepal is built by 1–2 developers on a small budget [Confirmed, Q1]. With so few people, the reason behind a decision usually lives in one person's head or in a pull-request thread. The repository already shows what happens then:

- **Decisions reversed without a record.** Commit `0282605` moved the vendor dashboard from `/vendors/dashboard` to `/shop/:shopSlug/dashboard`. It renamed route groups without updating the callers, which broke vendor registration (RF-03, audit IAM-02). The planning set now proposes reversing the prefix again to `/seller/{shopSlug}` (OD-12). The first change had no written rationale, so the second one cannot be checked against it. [Verified-repo, `start/routes/shops.ts:11`]
- **Documentation and code disagree.** `database/README.md` documents pivot tables `user_roles`, `role_permissions` and `shop_staff_roles`, while the migrations create `global_user_roles`, `global_role_permissions` and `shop_staff_assignments` (RF-20). The README contradicts the code on stack, licence and status (RF-42). [Verified-repo]
- **History has been rewritten.** Applied migrations were edited in place. The users migration was touched by 8 commits, and commit `9144745` changed `payments.paid_at` inside a create migration (RF-41). Nobody can tell which schema decisions were deliberate.

This documentation set makes several decisions that are expensive to reverse: money representation, tenancy model, session store, job backend, hosting region, URL scheme and error contract. They need a durable "why", separate from the "what" in the specification documents ([architecture](../03-system-architecture.md), [domain model](../04-domain-model-and-data-dictionary.md), [API](../06-api-design.md)).

MADR ("Markdown Architectural Decision Records", version 4.0.0, released 2024-09-17) is a lightweight template. Its sections are Context and Problem Statement, Decision Drivers, Considered Options, Decision Outcome, Consequences, Confirmation, Pros and Cons of the Options, and More Information. Most of them are optional. [Verified-doc, https://adr.github.io/madr/, accessed 2026-09-25]

## Decision

We record architecture decisions as ADRs in `docs/adr/`, using a trimmed MADR layout adapted for a small team.

1. **Location and naming.** One file per decision: `docs/adr/NNNN-kebab-title.md`, numbered sequentially from 0001. Numbers are never reused, even when an ADR is rejected. The [index](README.md) lists every ADR.
2. **Required sections**, in this order: Status, Context, Decision, Alternatives considered, Consequences (positive, negative, risks), When to revisit, Verification, Related. They map to MADR as follows: "Considered Options / Pros and Cons" → *Alternatives considered*; "Confirmation" → *Verification*. We add *When to revisit*, because a small team needs explicit triggers rather than periodic architecture reviews.
3. **Status values.**
   - `Proposed`: written, but depends on an open decision (OD-xx) or an external verification (VX-xx). The Status table names the blocking IDs.
   - `Accepted`: the team builds against it.
   - `Deprecated`: no longer applies and has no replacement.
   - `Superseded by ADR-NNNN`: replaced by a newer ADR.
4. **Immutability.** Once an ADR is Accepted, its Context, Decision and Alternatives are not rewritten. A changed decision gets a new ADR that supersedes the old one, and both Status tables are updated. The only edits allowed in place are typo fixes, link repairs, status changes, and additions to *Verification* when new tests enforce the decision.
5. **Labels.** ADRs use the evidence labels defined in [docs/00](../00-context-assumptions-and-questions.md): [Confirmed], [Verified-repo], [Verified-doc], [Assumption], [Open] OD-xx and [Verify-external] VX-xx. External facts cite a URL and an access date. Prices are always written "as published on <date>".
6. **Ownership split.** An ADR records the decision and the reason for it. The specification document that owns the detail (tables, endpoints, state tables, tests) holds that detail, and the ADR links to it. For example, ADR-0007 decides "integer paisa", while the column list lives in [docs/04](../04-domain-model-and-data-dictionary.md).
7. **When an ADR is required.** A pull request needs a new or superseding ADR when it:
   - changes money representation, rounding, allocation or ledger posting rules (ADR-0007, ADR-0009);
   - changes tenancy, authorization or authentication (ADR-0005, ADR-0006);
   - adds a stateful infrastructure service such as Redis, a search engine or a second database (ADR-0002, ADR-0010, ADR-0014);
   - adds or replaces an external provider: payment gateway, email, SMS, storage or hosting (ADR-0012, ADR-0013, ADR-0016);
   - changes the public URL scheme, API versioning or error contract (ADR-0004, ADR-0017, ADR-0018);
   - changes the migration policy (ADR-0011);
   - adds a UI registry or third-party component source (ADR-0015);
   - weakens a security control, for example disabling CSP or CSRF on a route.

   Library patch upgrades, new shadcn primitives within ADR-0015's policy, and new endpoints that follow ADR-0004 need no ADR.
8. **Workflow.** An ADR arrives as `Proposed` in the same pull request as the first code that depends on it, or earlier. With two developers, the other developer reviews it. With one developer, the product owner acknowledges it in the PR. Once every blocking OD/VX in the [risk register](../risks-and-open-decisions.md) is closed, the status moves to Accepted in a follow-up commit.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| No ADRs; rationale stays in PR descriptions and chat | PR text cannot be found once the PR is merged and is not versioned with the docs. RF-03, RF-20 and RF-42 are examples of the cost. |
| Wiki or Notion outside the repository | It drifts from the code, is not reviewed in the same PR, and would mean granting extra tool access to every contributor. The repository is already the single source for docs. |
| Nygard's original four-section format (Status, Context, Decision, Consequences) | Too thin for this team. It has no *Verification* section, so a decision cannot be tied to a CI check, and no *When to revisit* section, so we would lose track of the thresholds (for example ADR-0014's search limits). |
| Full MADR with a Pros/Cons subsection per option and decision-driver lists | Doubles the writing time per ADR for 1–2 developers. A table of alternatives with the rejection reason gives most of the value. |
| ADR tooling (adr-tools, log4brains) | Adds a dependency for about 20 files. Plain Markdown and a CI heading check are enough at this size. |

## Consequences

**Positive**
- A new developer can read 18 files and understand why the system looks the way it does, without asking the original author.
- Each decision carries its own triggers for revisiting, so the team reacts to measured conditions (connection counts, latency, legal answers) rather than rediscovering them.
- Proposed ADRs make external blockers visible (OD-01, VX-09, VX-13) next to the design that depends on them.

**Negative**
- Writing an ADR takes about 30–60 minutes of a scarce developer's time.
- Superseding instead of editing makes the history longer, and readers must follow the "Superseded by" links.

**Risks**
- *ADR rot*: the code changes but the ADR is never superseded. Mitigation: every ADR names the test IDs or CI checks that enforce it. If those checks are changed or removed, the PR diff shows it.
- *Status drift*: a Proposed ADR stays Proposed after its OD closes. Mitigation: the milestone exit checklist in [docs/12](../12-roadmap-and-backlog.md) includes "ADR statuses match the OD/VX register".

## When to revisit

- More than 50 ADRs, or more than 5 active contributors: consider generated indexes or decision-log tooling.
- Two consecutive milestones end with architecture-relevant PRs merged but no ADR added or updated: review whether the triggers in Decision item 7 are being followed.
- DripNepal adopts a company-wide documentation platform that must hold engineering records.

## Verification

- **CI docs check** (job defined in [docs/10](../10-testing-and-quality-gates.md)). It validates Markdown links and checks that every `docs/adr/NNNN-*.md` contains the required headings (`## Status`, `## Context`, `## Decision`, `## Alternatives considered`, `## Consequences`, `## When to revisit`, `## Verification`, `## Related`). It also fails if two ADRs share a number or if an ADR is missing from `README.md`.
- **PR template checkbox**: "Does this change a decision listed in docs/adr? If yes, link the new or superseding ADR."
- **Milestone exit review** ([docs/12](../12-roadmap-and-backlog.md)): ADR statuses are compared with the OD/VX register. For example, ADR-0011 moves to Accepted when OD-01 is closed.

## Related

- [ADR index](README.md)
- [Context, assumptions and questions (label vocabulary, RF findings)](../00-context-assumptions-and-questions.md)
- [Risks and open decisions (OD/VX registers)](../risks-and-open-decisions.md)
- [Milestones and traceability](../12-roadmap-and-backlog.md)
- [Testing and CI gates](../10-testing-and-quality-gates.md)
