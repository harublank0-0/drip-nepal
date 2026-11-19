# NCM webhooks, statuses and status processing

Labels:
- **[doc]** NCM's current documents: the webhook doc v1.1 (September 2026, "Beta") and the API doc v2 (see [api-contract.md](api-contract.md) for both). Example values are adapted, with ids and dates changed.
- **[v1 doc]** only in the superseded API doc dated `251222`.
- **[inferred]** follows from the documents without being stated in them.
- **[observed]** seen in one production integration's code, not in NCM's documents. Code shows what the integration *handles*, not what NCM *sends*; confirm with NCM.
- **[observed 2026-11-16]** returned by NCM's production API to a read-only call on that date; not confirmed by NCM (see [api-contract.md](api-contract.md)).
- **[reported]** that integration's team reports it from production checks; it is not visible in its code.
- **[recommended]** a design rule for your project.
- **[unknown]** not settled by any source.
- **[NCM, date]** answered by NCM outside its documents; see [open-questions.md](open-questions.md#answers).

## The webhook contract [doc]

**Setup.** Either in the NCM vendor portal: API section (`/accounts/vendor/api`)
→ "Webhook/API Callback URLs" → put your URL in **"Order Delivery Webhook URL"**
→ "Test Webhook" → "Add/Update" [doc]. Or through the API [doc]:
- `POST /api/v2/vendor/webhook` with `{"webhook_url": "<url>"}` sets it (`""` removes it);
- `POST /api/v2/vendor/webhook/test` with `{"webhook_url": "<url>"}` sends a test event and answers **200 even when the test failed**: the test passed only if `status_code` in the answer is 2xx, whatever `success` says.

The webhook doc says the API sets the same URL as the portal field [doc].
Details and responses: [api-contract.md](api-contract.md#webhook-registration-and-test).

**URL.** Valid HTTP or HTTPS; HTTPS recommended; may include query parameters.
NCM's own example is `https://your-domain.com/api/ncm-webhook?token=your-secret`.

**Request.** `POST` with headers `Content-Type: application/json`,
`Content-Length`, `User-Agent: NCM-Webhook/1.0`. Those are the only headers the
doc lists: **no signature, HMAC or timestamp header is documented** [doc].
NCM's security advice is "Consider using
query parameters or headers for authentication" [doc], and it documents no way
to configure a header, so a secret in the URL is what's available [inferred].

**Response.** Answer within **10 seconds** with **any 2xx**. Body content is
ignored. The test endpoint's timeout message names the same 10 seconds [doc].

**Delivery.** "No retry mechanism is currently implemented: a failed or
timed-out webhook is not sent again." Failures are handled silently on NCM's
side and don't affect the order. **A missed webhook is lost for good**, so you
need polling reconciliation (below).

**Scope.** "You only receive your own orders." When one NCM action covers
several vendors, each vendor gets a separate request with only its orders.

**Handling rules NCM gives.** Decide by `event`, not `status` ("status is a
display label"). Read both `order_id` and `order_ids`. Answer 2xx to events you
don't recognise, because new events may be added. Be ready for many requests
and for duplicates.

### Events [doc]

| `event` | `status` label | Meaning | Payload |
|---|---|---|---|
| `pickup_completed` | Pickup Complete | picked up from you, received at the NCM branch | bulk |
| `dropoff_collected` | Drop off Order Collected | an order you dropped at a branch was received | bulk |
| `order_dispatched` | Dispatched | left its origin branch | bulk |
| `order_arrived` | Arrived | reached its destination branch | bulk |
| `sent_for_delivery` | Sent for Delivery | out for delivery | bulk |
| `delivery_completed` | Delivered | delivered | **single** |
| `order_marked_rtv` | Order Marked Return | marked for return to you | bulk (one order) |
| `send_to_vendor` | Send to Vendor | return on its way back with an NCM rider | bulk |
| `rtv_delivery` | RTV Delivered | return delivered back to you | bulk |
| `refund_initiated` | Refund Initiated | a refund was created | refund |

Notes [doc]:
- Transfers between intermediate branches send no event.
- **The webhook `status` can differ from the order's status in NCM.** After
  `send_to_vendor` the order reads `Sent to Vendor`; after `rtv_delivery` it
  reads **`Delivered`**.
- **The event list has no event for "Pickup Order Created" or "Sent for
  Pickup".** The status APIs show them.

Three more events arrive although the webhook doc doesn't list them. One
platform's stored webhooks, mid-July to mid-November 2026, show their payloads
[reported]:
- `comment_added`, by far the most frequent event. Invented values, reported shape:

  ```json
  {"event": "comment_added", "order_id": "1001", "comment_id": "501", "comment": "Customer asked for evening delivery", "comment_type": "Info", "display": "External", "status": "None", "timestamp": "2026-01-02T09:12:00.000000+00:00"}
  ```

  - `order_id` and `comment_id` are digit strings. `comment_id` equals the `pk` of the same comment in the comment APIs [reported].
  - `comment_type` was `Info` or, rarely, `Action`; `display` was `External`; `status` is the text `"None"`, not JSON `null`.
  - There is **no author field**. One integration's parser reads an optional `added_by` (default "NCM") [observed]; it never arrives [reported].
  - Comments go to NCM's separate portal field, the **"Order Comment Webhook URL"**, per that integration's notes. The API doc v2 says the webhook endpoint manages URLs for "order status and comment events", but it documents neither this payload nor a parameter for the comment URL [doc]; `webhook_url` is the order status URL. Comment webhooks kept arriving at a URL whose secret matched no shop, so an old comment URL stays set until someone changes it in the portal [reported].
- `returned_to_warehouse`: a bulk event (`order_ids`) that also carries a `returnReason` string [reported]. Its meaning is [unknown]; the order status `Returned to Warehouse` appears in the status history from the same period.
- `exchange_initiated`: rare. It carries `customer_order` and `exchange_order` objects [reported], like the two orders the exchange endpoint creates; their exact fields weren't recorded here [unknown].

Undocumented fields on documented events [reported]:
- `delivery_completed` usually carries `cod_charge` and `delivery_charge` as decimal strings (in about 70% of events), next to the documented fields.
- `order_marked_rtv` carries a `returnReason` string.
- `rtv_delivery` carries `orders: [{"order_id", "delivery_charge"}]` next to `order_ids`.

Treat all of these as optional: NCM hasn't documented them.

What that platform's data shows about delivery [reported]:
- **No webhook ever came for `Pickup Order Created` or `Sent for Pickup`**, as the doc says.
- **The largest bulk event held 100 ids** (`pickup_completed`, averaging under 50); 100 may be NCM's cap [unknown].
- **No parcel ever received an event older than one it had already received**, across thousands of parcels with two or more events. NCM doesn't promise this; keep the ordering rules below.

### Payloads [doc]

Single (`delivery_completed`):

```json
{"order_id": "1001", "status": "Delivered", "timestamp": "2026-01-02T07:39:30.960365+00:00", "event": "delivery_completed"}
```

Bulk (every other status event): `order_ids` holds one or more ids, **as strings**.

```json
{"order_ids": ["1001", "1002", "1003"], "status": "Dispatched", "timestamp": "2026-01-02T05:51:35.006775+00:00", "event": "order_dispatched"}
```

Refund (`refund_initiated`): a refund creates **two new NCM orders**, and both
are included.

```json
{
  "order_id": "1001",
  "status": "Refund Initiated",
  "customer_order": {"order_id": "1050", "cod_charge": "-1500.00", "delivery_charge": "150.00"},
  "refund_order":   {"order_id": "1051", "cod_charge": "1500.00",  "delivery_charge": "0.00"},
  "timestamp": "2026-01-03T11:47:01.123456+00:00",
  "event": "refund_initiated"
}
```

- `customer_order` returns the money to the customer; its `cod_charge` is the
  original COD **as a negative value**.
- `refund_order` brings the item back to you.
- Both then move like any other order, so their later events arrive too.
- `cod_charge` may be a string or `null`.

`timestamp` is "ISO 8601 timestamp in UTC" [doc], and status and comment
webhooks did carry `+00:00` [reported]. The status API's `added_time` uses a
`+05:45` offset [doc], as did most test webhooks [reported]. Always parse to an
instant, and store and compare instants.

Test payload, from the portal's "Test Webhook" button or from
`POST /api/v2/vendor/webhook/test` (note the different shape, and its `+05:45`
offset; the API doc's copy has no fractional seconds):

```json
{"event": "order.status.changed", "order_id": "TEST-123456", "status": "In Transit", "timestamp": "2026-01-02T15:30:00.000000+05:45", "test": true}
```

[recommended] Authenticate it like any other event, record it in the inbox as a
test, answer 2xx, and write nothing to orders.

## Status vocabulary

There is **no complete, published list** of NCM order statuses [unknown]. These
are every string the sources show.

| String | Where it appears | Notes |
|---|---|---|
| `Pickup Order Created` | status API example [doc] | The earliest row of the doc's status-history example. No webhook. |
| `Drop off Order Created` | bulk status example [doc] | Meaning [unknown]; the name suggests a branch drop-off order was created. No webhook. |
| `Sent for Pickup` | status API example [doc] | No webhook. NCM sets it for every new pickup parcel, whether or not the vendor has packed it [reported]. |
| `Pickup Complete` | status API [doc]; `pickup_completed` [doc] | |
| `Drop off Order Collected` | `dropoff_collected` [doc] | |
| `Dispatched` | `order_dispatched` [doc] | No API example shows it. The status-history API sends `Dispatched to <BRANCH>`, often, while the webhook says just `Dispatched` [reported]. `<BRANCH>` can be a return branch, such as `RETURN ( TINKUNE)`, spaces included [reported]. |
| `Arrived` | bulk status example; `order_arrived` [doc] | Likewise `Arrived at <BRANCH>` in the status-history API, `Arrived` in the webhook [reported]. |
| `Sent for Delivery` | status API; `sent_for_delivery` [doc] | |
| `Out for Delivery` | one integration's status map [observed] | that integration's own name for the Sent for Delivery stage. NCM never sent it in four and a half months of that platform's data [reported]. |
| `Delivered` | everywhere [doc] | **Also the final status of a return to the vendor** [doc]. |
| `Order Marked Return` | `order_marked_rtv` [doc] | webhook label |
| `Send to Vendor` / `Sent to Vendor` | webhook label vs the order's NCM status [doc]; `Sent to Vendor` is also a `last_delivery_status` in the API doc's customer-detail example | two spellings for one stage |
| `RTV Delivered` | `rtv_delivery` [doc] | the order itself then reads `Delivered` |
| `Refund Initiated` | `refund_initiated` [doc] | |
| `In Transit` | test webhook payload only (webhook doc and API doc) [doc] | |
| `Delivery Attempted` | one integration's status map [observed] | not in the documents. NCM never sent it in four and a half months of that platform's data [reported]. |
| `returned_to_warehouse` (event) | [reported] | not in the documents; carries a `returnReason`; meaning [unknown] |
| `Returned to Warehouse` (status) | status-history API, from late July 2026 [reported]; `last_delivery_status` in the undocumented `/order/redirectable` list [observed 2026-11-16] | not in the documents. Every parcel on the redirectable list's first page had it. Probably the status behind the `returned_to_warehouse` event, and a parcel NCM holds that can be redirected [inferred]; meaning [unknown] |
| `exchange_initiated` (event) | [reported] | not in the documents; carries `customer_order` and `exchange_order` |
| `Completed` | `payment_status` in the order detail [doc] | a payment field, not a delivery status |
| `Delivery Pending` | `payment_status` in the order detail [observed 2026-11-16] | on an undelivered parcel; a payment field, not a delivery status |

[recommended] Match status strings case-insensitively after trimming and turning
`_`/`-` into spaces; match `Dispatched to …` and `Arrived at …` by prefix; and
log, never drop silently, any status you don't recognise.

## Keep four states apart

| State | Owned by | Changes when | Never infer it from |
|---|---|---|---|
| **Shipment state** (what NCM says about the parcel) | NCM | every webhook or poll | your order status |
| **Order state** (your business workflow) | your project | your rules decide, using shipment changes as inputs | a raw NCM string, copied blindly |
| **Payment state** (has the customer paid) | your project, plus a payment gateway or COD collection | prepayment, or NCM collecting the COD | `Delivered` alone |
| **Settlement state** (has the vendor been paid the collected COD) | NCM's remittance process, and your books | NCM transfers the money | `Delivered` or `payment_status: "Completed"`; no documented field confirms remittance [unknown] |

A **return** is a fifth concern. NCM ends a return-to-vendor as `Delivered`;
only the order detail's `vendor_return` flag [observed] or the RTV events
(`order_marked_rtv`, `send_to_vendor`, `rtv_delivery`) [doc] tell it apart.

`vendor_return` arrives as a **string**: `"False"` on production
[observed 2026-11-16]. `"False"` is truthy in most languages, so never test it
as a boolean. Wherever this file says `vendor_return` "is true" or "turns
true", read it with the parsing rule in
[api-contract.md](api-contract.md#order-detail).

## Mapping template [recommended]

Fill this in **with the user** for the destination project. Every row needs an
explicit decision; "copy NCM's string onto the order" is not one.

| NCM event or status | Shipment state to store | Order state change | Side effects to decide |
|---|---|---|---|
| `Pickup Order Created`, `Drop off Order Created` (poll only) | created | none (the parcel exists, which says nothing about packing) | none |
| `Sent for Pickup` (poll only) | awaiting pickup | none recommended: NCM sets it automatically | none |
| `pickup_completed`, `dropoff_collected` | collected | e.g. → "Shipped" | stock leaves the shop? customer SMS? |
| `order_dispatched` | in transit | optional | |
| `order_arrived` | at destination branch | optional | |
| `sent_for_delivery` | out for delivery | e.g. → "Out for delivery" | customer SMS? |
| `Delivery Attempted` (poll) [observed]; never sent by NCM in one platform's data [reported] | stays out for delivery; the attempt is recorded | none | staff alert? |
| `delivery_completed`, or `Delivered` from a poll, on a parcel **not** in a return stage | delivered | e.g. → "Delivered", **only if not a return**: no RTV event on record, and the order detail's `vendor_return` isn't true [observed field] | COD becomes *collectable*, not settled; the "delivered" message |
| `Delivered` from a poll on a parcel in a return stage (`return requested` or `return in transit`) | returned to vendor | as `rtv_delivery` | as `rtv_delivery`. NCM's order reads `Delivered` after `rtv_delivery` [doc], so this is how a return completes when the `rtv_delivery` webhook was lost |
| a return signal **after** delivered (`vendor_return` turns true, or a late RTV event) | returned | decide: move the order to returned, or alert staff | reverse the COD expectation; restock per D4; no "delivered" message was wrong, but the customer may need a word |
| `order_marked_rtv` | return requested | e.g. → "Returning" | staff alert |
| `send_to_vendor` | return in transit | | |
| `rtv_delivery` | returned to vendor | e.g. → "Returned" | restock? (a business decision) |
| `refund_initiated` | refund pending on the original; two **child shipments** (customer leg, refund leg) | the original order: refund pending; the legs' own events never move it | money moves back (who refunds a prepaid customer?); finance decision |
| `returned_to_warehouse` [reported], or `Returned to Warehouse` from a poll [observed 2026-11-16] | record the raw event or status; no stage | none until NCM explains it | staff alert |
| `comment_added` [reported] | none | none | store the comment once (match on comment id with the polled copy), notify staff |
| `exchange_initiated` [reported] | record the event and the two new orders as child shipments | none until the user decides | staff alert; decide stock and money as for an exchange you requested |
| unknown event | record it | none | alert; answer 2xx |

If your own system calls `POST /api/v2/vendor/order/return`, record that you
did. That call sets the order's `vendor_return` flag to `true` [doc], which the
order detail then shows [observed], probably as the string `"True"` [inferred],
and your post-delivery check must not take it for a return NCM started.

No cancel endpoint is documented [doc]. If an order is cancelled locally after
the parcel exists:
- decide how NCM is told (a ticket, a comment, the portal);
- keep polling that parcel;
- decide what happens if NCM collects it anyway. The order should stay cancelled, staff are alerted, and stock is reconciled, because the goods have left.

## Processing rules [recommended]

1. **Authenticate before you store anything.** Give each NCM account its own
   URL, with a **non-secret account id in the path** and a secret in the query.
   Two workable designs:
   - **Random secret per account**, stored hashed: `/webhooks/ncm/<account-id>?token=<secret>`. Intake looks the account up by id and compares in constant time. Rotation per account: store the new hash beside the old for a window, then drop the old. Needs the database at intake.
   - **Derived secret with a version in the path**: `/webhooks/ncm/<account-id>/<version>?token=HMAC(server_key, "<account-id>:<version>")`. Intake verifies with no database, so it keeps receiving while the database is down. The worker rejects a version below the account's minimum accepted version. Rotation per account: register the URL for the next version with NCM (portal or `POST /api/v2/vendor/webhook`), keep accepting the old version for a window, since NCM may already be sending to it, then raise the minimum. To revoke a leaked URL, raise the minimum at once. Intake can't see the minimum without the database, so events to a revoked version are still stored until the worker drops them; give intake a cached copy of each account's minimum, or rate-limit it per account, if a leaked URL filling the inbox matters. `server_key` never changes for either.
   
   Either way, keep the query string out of access logs, and never queue the secret with the event.
2. **Acknowledge fast and durably.**
   - Persist the raw event (or enqueue it), answer 2xx, and process asynchronously. NCM allows 10 seconds and never retries.
   - An intake that runs separately from the main app keeps receiving during app downtime. Inside a monolith, a down app loses events, and reconciliation must catch up.
3. **Scope matching to the account.** NCM ids appear to be per-account sequences, so the same id may exist under two accounts [observed]. Match on `(account, ncm_order_id)`, never on the id alone, and record on each shipment which account created it.
4. **Process one parcel at a time** within a bulk event, each in its own
   transaction. `pickup_completed` arrives with up to about 100 ids, and one
   transaction over the whole batch timed out in production [reported].
5. **Make each status event idempotent.** Store every event with its raw label,
   a normalised **stage** (your own enum; the one used below is `created`,
   `awaiting_pickup`, `collected`, `in_transit`, `at_destination`,
   `out_for_delivery`, `delivery_attempted`, `delivered`, `return_requested`,
   `returning`, `returned`, plus `refund_pending` as a flag on the original
   parcel), its event time and its source (`webhook` or `poll`). An event you
   can't map gets no stage.
   - **Exact redelivery:** unique on `(account, ncm_order_id, source, raw label, event time)`. A clash means "already seen"; send no SMS, notification or stock change.
   - **Same transition from both channels:** webhook times and API `added_time` differ for one transition, and labels can differ too (`Sent for Delivery` vs `Out for Delivery`). Treat a poll row and a webhook row as the same transition when the stage matches and the times are within a tolerance. One integration uses 5 minutes [observed].
   - Side effects fire only when the **stage** changes.
6. **Never move backwards.** Rank the stages and apply forward moves only:
   - forward: `created` < `awaiting_pickup` < `collected` < `in_transit` < `at_destination` < `out_for_delivery` = `delivery_attempted` < `delivered`;
   - return branch, reachable from any forward stage including `delivered`: `return_requested` < `returning` < `returned`.
   
   A `Delivered` label read while the parcel is in `return_requested` or
   `returning` maps to `returned`, not `delivered`: NCM's order reads
   `Delivered` once a return reaches the vendor [doc]. Use the event time only
   to order events within one stage; it can't order stages, because NCM's real
   transitions can be closer together than the webhook-vs-API time difference.
   Compare **stages**, not raw labels, when deciding whether a poll result is
   news, or a benign label difference will re-fetch history every run.
7. **Claim the shipment's stage** with a conditional update
   (`UPDATE shipment SET stage = <new> WHERE id = ? AND stage = <old>`) and
   check the row count. Side effects belong to the winner of that claim: the
   other channel, arriving a moment later, records its event and stops. In the
   same transaction, move the order with its own conditional update on the
   status you read. Losing either claim means someone else moved it: no side
   effects.
8. **Protect statuses staff set on purpose** (cancelled, on hold) and final
   ones (returned) from courier overwrites. Record the courier status on the
   shipment and alert staff instead.
   - `Delivered` is final for forward events.
   - A **return signal** (an RTV event, or `vendor_return` turning true) may still follow it. Handle that as the "return after delivered" row of the mapping, never by ignoring it.
9. **Treat `Delivered` carefully.** Before you mark the order delivered or text
   the customer, check for a return: the parcel's stage (rule 6), an RTV event
   on record, or the order detail's `vendor_return` [observed] read at that
   moment, parsed from its string form (`"False"` [observed 2026-11-16]). If
   that read fails, don't send the delivered message: retry the read, or hold
   the delivered transition for a person. A return you requested yourself
   (`POST /api/v2/vendor/order/return`) must be on record, so its
   `vendor_return` reading true isn't taken for a return NCM started.
10. **Confirm high-impact events with an API read.** A webhook carries no
    signature [doc], so read `GET /api/v1/order/status?id=` or the order detail
    before restocking, refunding, or changing money owed.
11. **Run side effects after commit:** live UI events, notifications and SMS.
    Each failure is isolated and logged; none of them may roll back the status.
12. **Unknown events and statuses:** record them, answer 2xx, alert, and change no
    order.
13. **Missing or unreadable `timestamp`:** use the receive time, and mark the event
    as such, so it never outranks a real NCM time.
14. **Unmatched ids:** record which ids matched no shipment. They may belong to
    another account, to orders created outside your system (the portal or bulk
    upload), or to a misconfigured secret. Count them on a dashboard.
15. **Don't replay old events** from your job system's failure store until
    rules 5–9 exist. Without them, a replay moves orders backwards and
    texts customers again.
16. **Keep an inbox.** One row per received webhook: source, raw payload (with
    personal data minimised), outcome (`processed`, `partial`, `no_match`,
    `invalid`, `unknown_event`, `test`, `error`), unmatched ids, error text. That
    row is how operators answer "did NCM tell us?".

## Reconciliation, because webhooks are never retried [recommended]

- **Scheduled sweep.** Every few hours, take parcels that are not finished and
  not checked recently, grouped **per account token**. Include parcels whose
  order was cancelled locally: NCM may still move them. Call
  `POST /api/v1/orders/statuses` in batches. Map each answer to a stage; only
  for parcels whose **stage** differs from the stored one (or doesn't map),
  fetch `GET /api/v1/order/status?id=` for the timestamps, and apply the newest
  entry through **the same transition function** as the webhook. Remember
  that `Delivered` on a parcel in a return stage means `returned` (rule 6).
- **Ids under `errors`, or missing from `result`:** don't mark them "checked and
  fine". NCM gave no status for them, for a reason the docs don't explain. Make
  a per-order status call; if that answers 404 "Not found.", or keeps answering
  500 (the API doc lists a 500 for a bad id, see
  [api-contract.md](api-contract.md#errors)), flag the parcel for a person.
- **Post-delivery return check.** A return can show only as `vendor_return`
  flipping after `Delivered` [observed]. Re-check recent deliveries' order detail
  for a while, and apply a hit as the mapping's "return after delivered" row.
- **Budget the calls.** Per-order status reads count against the 20,000 daily
  "Order View (Detail, Comments, Status)" reads [doc] (5,000 in the v1 doc
  [v1 doc]). Whether the bulk status call counts at all, and if so once or per
  id, is [unknown]; assume per id until NCM says otherwise. Size the sweep (batch size, staleness window,
  look-back days) so it fits with room for manual refreshes.
- **Manual refresh.** One button per order that runs the same per-order sync,
  for support staff.
