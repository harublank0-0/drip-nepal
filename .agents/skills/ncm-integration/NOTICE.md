# Source and licence

This is the `ncm-integration` skill as commit `bd23da5` ("chore: add NCM integration skill") added it to this repository under `.claude/skills/`, moved here without changes on 2026-11-09; `skills-lock.json` at the repository root records it. It is MIT-licensed (`LICENSE` in this folder, copyright 2026 harublank0-0). No upstream repository is known for it. It has no scripts, runs nothing when it loads, pre-approves no tool and fetches no remote instructions.

It is a framework-neutral guide to integrating Nepal Can Move. In DripNepal it does not decide anything:

- **Its NCM API facts are not verified.** It labels facts [doc], [observed], [reported], [inferred] or [unknown] after NCM documents and a production integration that are not in this repository. None of them closes VX-16 (`docs/risks-and-open-decisions.md` §3.1), and decision 6 of ADR-0019 (the `CourierProvider` port) stays Proposed until VX-16 closes.
- **Where it disagrees with the documents, the documents win.** Shipment states and their transitions are in docs/05 §6.3, the tables in docs/04a §9.8 to §9.11 and §11, money in integer paisa (ADR-0007), the courier port in ADR-0019, the open COD question for platform-owned accounts in OD-58. Its "decisions to settle with the user" (D1 to D11) are settled in those documents or registered as open decisions there.
