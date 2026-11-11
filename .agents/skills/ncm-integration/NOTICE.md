# Source and licence

This is the `ncm-integration` skill as commit `bd23da5` ("chore: add NCM integration skill") added it to this repository under `.claude/skills/`, moved here without changes on 2026-11-09 and changed locally since (below); `skills-lock.json` at the repository root records it. It is MIT-licensed (`LICENSE` in this folder, copyright 2026 harublank0-0). No upstream repository is known for it. It has no scripts, runs nothing when it loads, pre-approves no tool and fetches no remote instructions.

It is a framework-neutral guide to integrating Nepal Can Move. In DripNepal it does not decide anything:

- **Its NCM API facts are not verified.** It labels facts [doc], [observed], [reported], [inferred] or [unknown] after NCM documents and a production integration that are not in this repository. None of them closes VX-16 (`docs/risks-and-open-decisions.md` §3.1), and decision 6 of ADR-0019 (the `CourierProvider` port) stays Proposed until VX-16 closes.
- **Where it disagrees with the documents, the documents win.** Shipment states and their transitions are in docs/05 §6.3, the tables in docs/04a §9.8 to §9.11 and §11, money in integer paisa (ADR-0007), the courier port in ADR-0019, the open COD question for platform-owned accounts in OD-58. Its "decisions to settle with the user" D1 to D11 are settled in those documents or registered as open decisions there. D12, the cross-NCM customer rating, is used by no document: building on it would first need an open decision in the risks register, under the personal-data rules of docs/07 §5.

## Local changes

- **2026-11-11, NCM API Documentation v2.** The product owner received a 32-page PDF, `NCM_API_DOC_V2`, from NCM; it is not in this repository. Its facts replace those of the PDF dated `251222`, and each changed fact says what the old PDF gave:
  - `references/api-contract.md`: the sources, daily limits (1,000 creates and 20,000 order views), pagination and error shapes; the new ticket path `/api/v2/vendor/ticket/create/new` with its `branch` field; the webhook registration and test endpoints; assigned branches, ticket detail and reply, customers, the customer rating and label data (#18 to #26), with sections on tickets, labels, and customers and ratings; the questions for NCM. The ticket-detail and rating endpoints leave the undocumented-endpoints table. The `401 {"detail": "Invalid token."}` the demo host gave the issued token on 2026-11-11 is recorded as seen, not as documented.
  - `references/webhooks-and-statuses.md`: registration and the test event; the read budget.
  - `references/checklists.md`: decisions D10 and D11, new decision D12 (the customer rating), four error shapes, webhook registration and test, ticket status and label data in steps 2, 6 and 9; the read budget.
  - `SKILL.md`: the description, overview, quick reference, limits and two common mistakes.
