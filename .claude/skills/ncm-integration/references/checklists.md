# NCM implementation and testing checklists

Framework-neutral. "Job" means whatever background-work mechanism the project
has (a queue, a cron runner, a job table), and "failure store" means where it
keeps failed jobs (a dead-letter queue, a failed-jobs table). "Transaction"
means the project's database transaction. Contract details are in [api-contract.md](api-contract.md)
and [webhooks-and-statuses.md](webhooks-and-statuses.md).

## Decisions to settle with the user first

Ask these before writing code. Each changes the data model or money.

| #   | Decision                                                                                                                                                                                            | Why it can't be guessed                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Whose NCM account?** One platform account, each vendor's own, or both.                                                                                                                            | NCM ids are per account; matching, polling and webhook secrets all depend on it.                                                                                   |
| D2  | **When is the parcel created?** On confirm, on "ready to ship", or by a person clicking.                                                                                                            | NCM has no hold and no cancel endpoint; a created parcel may be collected.                                                                                         |
| D3  | **Cancellation after creation.** How is NCM told (ticket, comment, portal by hand)? What if NCM collects it anyway?                                                                                 | No cancel endpoint is documented.                                                                                                                                  |
| D4  | **Returns.** Which events move the order; does a return restock automatically or wait for staff; how is a `Delivered` that is really a return handled?                                              | NCM ends a return as `Delivered`.                                                                                                                                  |
| D5  | **COD amount.** What goes in `cod_charge` for prepaid, partly paid and discounted orders; is the delivery charge added?                                                                             | NCM defines it as "cod amount including delivery". Whether `"0"` is accepted for a prepaid order is undocumented.                                                  |
| D6  | **COD settlement.** What proves the vendor was paid, who reconciles NCM's remittance, is `Delivered` "collectable" or "paid", and do vendors on their own NCM account settle with NCM directly?     | NCM documents a COD-transfer _request_ ticket (bank details), but no remittance statement or settlement field.                                                     |
| D7  | **Inventory.** Which courier states, if any, move stock; does a courier status ever override a staff decision?                                                                                      | Stock bugs are expensive and silent.                                                                                                                               |
| D8  | **Customer messages.** Which courier events text or email the customer, and never twice.                                                                                                            | Duplicate and out-of-order webhooks happen.                                                                                                                        |
| D9  | **Status mapping.** Fill in the template in webhooks-and-statuses.md for the project's real order states.                                                                                           | The project's states are its own.                                                                                                                                  |
| D10 | **Branches and rates.** Live NCM calls, a cached copy, or a stored table; refresh schedule; how the destination branch is chosen (from the address, a map pin, or staff); the shop's pickup branch. | Response shapes for both endpoints are undocumented; rates are quoted by branch name; branch ids (needed to redirect) come only from the undocumented branch list. |
| D11 | **Pickup requests.** How NCM is asked to collect: a `Pickup` ticket by hand or on a schedule, or arranged outside the system; how you avoid filing two while one is open.                           | NCM has no pickup endpoint, and documents no way to tell you a ticket was closed.                                                                                  |

## Implementation order

Each step ends with a checkpoint. Don't start the next step until it passes.

1. **Configuration and secrets**
   - Base URL and token per account from configuration or encrypted storage; demo and production kept apart, and the app refuses to start a production environment on the demo host.
   - A webhook URL per account: a non-secret account id in the path and a secret in the query. Prefer `HMAC(server_key, account_id)` as the secret, so intake can verify it without a database.
   - Secret rotation that accepts the old and the new secret for a window. The query string kept out of access logs.
   - A refusal at startup if the encryption key is missing, rather than a fallback key.
   - _Checkpoint:_ a unit test proves the right token is chosen for each account, and that no token appears in logs or API responses.
2. **One NCM HTTP client**
   - Sets the auth header and per-call timeouts.
   - Parses all three error shapes (`detail`, `Error`, `message`) and HTML bodies.
   - Maps failures to safe messages, and counts calls against the daily limits.
   - _Checkpoint:_ contract tests against recorded **synthetic** responses for every endpoint you use, including 400, 401, 404, 500 and a timeout.
3. **Data model**
   - A shipment with: the local order, the **account**, the NCM order id, a `kind` (primary, refund customer leg, refund return leg, exchange legs), a parent shipment for legs, delivery type, origin and destination branch, COD amount, delivery charge, NCM stage and raw status, its time, last checked time, return flag, and a needs-attention flag.
   - Unique `(account, ncm_order_id)`, and at most one active **primary** shipment per order.
   - A status-event table storing the raw label, normalised stage, event time and source. Unique on `(account, ncm_order_id, source, raw label, event time)`, plus the cross-channel tolerance rule ([webhooks-and-statuses.md, processing rule 5](webhooks-and-statuses.md#processing-rules-recommended)).
   - A webhook inbox table.
   - _Checkpoint:_ the migration runs on a copy; the unique keys reject duplicates.
4. **Branches and rates**
   - Fetch, validate the shape you actually receive, cache with a time to live, and degrade clearly when NCM is down.
   - Keep the rate `type` ↔ create `delivery_type` mapping in one place.
   - _Checkpoint:_ the order form shows a price for each delivery type, or an explicit "unavailable".
5. **Create the parcel**
   - **Claim first:** in a transaction, insert the shipment row in a `submitting` state. The guard is the partial unique index "one active primary shipment per order" (`ncm_order_id` is still empty here, so the `(account, ncm_order_id)` key can't be the guard).
   - Call NCM outside the transaction, with `vref_id` set to your order reference.
   - On success, store `orderid` and move to `created`.
   - On a clear 400, store the field errors and release the claim.
   - On a timeout or 5xx, mark it `unknown` for a person to check in NCM's portal. The API can't look a parcel up by `vref_id`. Never retry automatically: the create may have succeeded.
   - A sweeper turns `submitting` rows older than the create timeout plus a margin (a crashed worker) into `unknown`.
   - Make `vref_id` unique across every vendor on a shared account, for example `<store>-<order>`.
   - Validate what you know: required fields present, phone digits in your country's format, branch names from the cached list, COD as a non-negative decimal string. NCM's own field limits are undocumented, so keep any length limits configurable and confirm them with NCM.
   - _Checkpoint:_ tests for success, 400, timeout, a double click and two workers racing. Each ends with at most one NCM create call per order.
6. **Webhook receiver**
   - Authenticate the URL secret before storing anything.
   - Write the inbox row and answer 2xx within NCM's 10 seconds; hand off to a job.
   - A `test: true` event is authenticated, recorded as a test, and answered 2xx, with no order writes.
   - _Checkpoint:_ the NCM portal's "Test Webhook" reaches you and is recorded as a test.
7. **Status processing (one function for webhook and poll)**
   - Per parcel, in its own transaction:
     1. insert the event row; a unique-key clash is an exact redelivery: stop;
     2. look for a recorded event of the same stage within the tolerance; a hit is the other channel's copy: stop;
     3. compare the stage rank (forward only, except returns; `Delivered` in a return stage is `returned`);
     4. claim the shipment's stage with a conditional update; a lost claim means stop;
     5. decide the order move from the mapping and apply it with a conditional update on the order's status;
     6. queue side effects after commit, for the winner only.
   - Confirm return, refund and money events with an API read first.
   - _Checkpoint:_ every row of the testing checklist below passes.
8. **Reconciliation**
   - A scheduled sweep per account using bulk status, then per-order history for drift. It includes parcels of locally cancelled orders.
   - A post-delivery return check.
   - Ids NCM doesn't recognise are flagged, not silently stamped "checked".
   - A manual refresh button.
   - _Checkpoint:_ with webhooks switched off, a parcel still reaches its true status within one sweep window.
9. **Pickup requests, comments, tickets, redirect, return, exchange** (only those the user wants)
   - Pickup requests per D11. Claim the request locally (unique per account and slot) before filing the ticket.
   - Outbound comments through a job serialized **per account**, not globally.
     - Retry automatically only when the request clearly never reached NCM (connection refused, DNS failure).
     - After a timeout or 5xx, read the order's thread and look for the text before posting again: a comment post isn't idempotent.
     - Failures go to the job system's failure store (a dead-letter queue or a failed-jobs table).
   - Inbound comments from `comment_added` [observed], plus a periodic poll. De-duplicate on (account, NCM order id, `comment_id`) when present, else (account, NCM order id, text, author, `added_time`). Match your own echoed comments by text within a few minutes.
   - Redirects and returns: claim locally, call NCM, then record, as for create.
   - _Checkpoint:_ a comment round-trips once, never twice.
10. **Operations**
    - Dashboards for: webhook outcomes by type, unmatched ids, unknown events and statuses, parcels with no status change for N days, parcels NCM doesn't recognise, cancelled orders NCM still moves, `unknown` creates, the daily API budget, and failed jobs.
    - A runbook for each.
    - _Checkpoint:_ a person can answer "why is order X stuck?" from the dashboard and the inbox without reading code.

## Testing checklist

Use synthetic ids, names and phones only.

**Happy paths**

- [ ] A create with each `delivery_type` sends the right fields; the NCM `orderid` is stored.
- [ ] `pickup_completed` → `order_dispatched` → `order_arrived` → `sent_for_delivery` → `delivery_completed` moves the order exactly as the mapping says, with one customer message per mapped event.
- [ ] A bulk event with 100 ids updates all 100 parcels.
- [ ] A comment from NCM appears once; a comment to NCM is sent once.

**Failures**

- [ ] A create times out → no automatic retry; the shipment is `unknown`; a person can resolve it.
- [ ] A create is accepted by NCM, then the local commit fails → the shipment is left `unknown`; a person finds the parcel in NCM's portal and links it; the runbook covers it.
- [ ] A worker crashes mid-create → the sweeper turns the stale `submitting` row into `unknown`.
- [ ] NCM answers 400 with field errors → the user sees a safe, field-level message, never the raw body.
- [ ] NCM answers 401, 404, 500 or HTML → handled, logged without secrets.
- [ ] The database is down while a webhook arrives → intake still verifies it (HMAC secret) and queues it, or, if intake needs the database, the reconcile recovers the status later.
- [ ] A detail read fails while processing `delivery_completed` → no delivered message goes out; the read is retried or the transition is held for a person. For other stages the update applies and the read is retried later. Nothing is half-applied.

**Duplicates and ordering**

- [ ] The same webhook twice → one history row, one order move, no second SMS or notification.
- [ ] `sent_for_delivery` arrives after `delivery_completed` → history records it; the order stays delivered.
- [ ] A poll applies a status the webhook already applied, with a different time and label (`Out for Delivery` vs `Sent for Delivery`) → no change, no side effects.
- [ ] A replayed old event from the failure store → history only; the order doesn't move back.
- [ ] The webhook and the poll apply the same transition at the same moment, with different labels and times, and no order move is configured for it → exactly one wins the shipment-stage claim, and only it sends the side effect.
- [ ] `order_marked_rtv` and `send_to_vendor` arrive, the `rtv_delivery` webhook is lost, and the next sweep reads `Delivered` → the parcel becomes returned, the order follows D4, and no "delivered" message goes out.
- [ ] Staff change the order while a webhook is processing → staff win; the courier status is kept on the shipment only.

**State protection**

- [ ] A cancelled order receives `pickup_completed` → the order stays cancelled; staff are alerted.
- [ ] A return (`rtv_delivery`, or `vendor_return: true` with `Delivered`) never produces a "delivered" message to the customer, and follows the return decision (D4).
- [ ] `vendor_return` turns true days after a normal delivery → handled as "return after delivered" (D4).
- [ ] `refund_initiated` → two child shipments; their later events never move the original order.
- [ ] A forged webhook with a valid-looking body but a wrong secret → rejected; a return or refund event is confirmed with an API read before stock or money moves.
- [ ] An unknown event and an unknown status → recorded, answered 2xx, order unchanged, alert raised.
- [ ] `Sent for Pickup` from a poll doesn't change the order (if that's the decision).

**Tenant isolation**

- [ ] Two accounts with the same NCM order id → each event updates only its own account's shipment.
- [ ] An unknown or empty secret → rejected before anything is stored.
- [ ] A vendor's own-account secret can't update another vendor's or the platform's orders.
- [ ] Switching a vendor between its own account and the platform account doesn't strand parcels already in transit.

**Partial bulk failures**

- [ ] A bulk event where one parcel's transaction fails → the others are saved; the failed one is retried alone; no duplicate side effects for the saved ones.
- [ ] A bulk event with unmatched ids → matched ones are processed; unmatched ones are recorded for an operator.
- [ ] A bulk status call returns some ids under `errors` → those are flagged, not marked healthy.

**Limits**

- [ ] The reconciliation run stays within its share of 5,000 reads a day for the expected fleet size.
- [ ] A rate-limit or throttling response (shape unknown) backs off instead of hammering NCM.
