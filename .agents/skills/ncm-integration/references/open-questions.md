# Open questions for NCM

What NCM's documents (API doc v2, webhook doc v1.1) leave unspecified and an
integration depends on. Ask NCM before go-live, and record each answer here.
Background for each question is in [api-contract.md](api-contract.md) and
[webhooks-and-statuses.md](webhooks-and-statuses.md), where the gap is marked
`[unknown]`.

## How to resolve one

1. Set its status to `Answered` and add an entry under [Answers](#answers): the date, who answered and how (for example "NCM IT, by email"), and the answer, quoted where you can.
2. Update every section that cites the gap. Change its `[unknown]` label to `[doc]` if NCM published the answer in a document (add the document to the sources), or to `[NCM, <date>]` if it came by email, call or ticket.
3. Rebuild the single-file reference: `python3 scripts/build_reference.py`.

An answer seen on the live API but not given by NCM is labelled
`[observed <date>]`, never `[doc]` or `[NCM, <date>]`, and its status says
"(observed)". A finding from the reference integration's own production data
is labelled `[reported]`, and its status says "(reported)". Still ask NCM to
confirm both: what one account saw can change.

Statuses: `Open` (not asked yet), `Asked` (sent to NCM, no answer), `Answered`,
`Partly answered` (some of the question is settled; the rest is still open),
`Dropped` (NCM declined, or it no longer matters; say why under Answers).

## Questions

| # | Topic | Question | Status |
|---|---|---|---|
| 1 | Hosts | The production base URL, and whether demo tokens and data are separate from production. | Partly answered (observed) |
| 2 | Limits | Rate-limit scope (per token?), reset time, the response when it's exceeded, and which endpoints count against the 20,000 daily reads (bulk status, labels, customers, ratings, tickets). | Open |
| 3 | Branches | Response shapes for `/api/v2/branches` and `/api/v1/shipping-rate`, and whether the branch list needs a token. | Answered (observed) |
| 4 | Cancellation | How to cancel an order, or hold one, after create, and whether a ticket type is meant for it. | Open |
| 5 | Cancellation | Whether a parcel can still be collected after you decide to cancel it, and how to stop that. | Open |
| 6 | Status | Maximum batch size for `/api/v1/orders/statuses`, and why an id lands in `errors`. | Partly answered (observed, reported) |
| 7 | COD | What `payment_status` values exist, how COD remittance to the vendor is reported, and what follows a COD transfer ticket. | Partly answered (observed) |
| 8 | Orders | Whether `vref_id` is checked for duplicates, and whether a parcel can be looked up by it (the label's `vendor_orderid` suggests NCM stores it). | Partly answered (reported) |
| 9 | Tickets | Whether the v1 doc's ticket path `/api/v2/vendor/ticket/create` still works, and until when. | Dropped |
| 10 | Tickets | For `Pickup` tickets: whether `branch` is matched case-sensitively, the error for a missing or unassigned branch, and whether create's `fbranch` must also be an assigned pickup branch. | Partly answered (reported) |
| 11 | Tickets | Which ticket-detail `status` value means open. | Partly answered (reported) |
| 12 | Webhooks | How to set an order comment webhook URL through the API (the webhook endpoint mentions comment events and "URLs" but takes only `webhook_url`), and the comment event's payload. | Partly answered (reported) |
| 13 | Webhooks | The full list of order statuses and webhook events, including `comment_added`, `returned_to_warehouse`, and the maximum ids in one bulk event. | Partly answered (reported) |
| 14 | Orders | Whether undocumented fields (`vendor_return`, `delivered_date`, `active`, a tracking id) and `/order/redirectable` are supported for vendors. | Partly answered (observed) |
| 15 | Webhooks | Whether webhooks for one parcel arrive in order. | Partly answered (reported) |
| 16 | Orders | Which characters names and addresses may contain (Devanagari?), and the length limits per field, comment and ticket response. | Open |
| 17 | Webhooks | How to rotate a webhook secret without losing events: whether a new `webhook_url` takes effect at once, and whether the old one keeps receiving in-flight events. | Open |
| 18 | COD | Whether `cod_charge: "0"` is accepted for a prepaid order, and what the rider then collects. | Partly answered (reported) |
| 19 | Branches | Where branch ids come from, since the redirect's `destination` needs one, and whether the label's branch `code` is accepted anywhere. | Partly answered (observed) |
| 20 | Status | Whether `Delivery Attempted`, `Out for Delivery` and `Dispatched to <BRANCH>` are real status strings, and what `returned_to_warehouse` means. | Partly answered (observed, reported) |
| 21 | Comments | Whether posting a comment or a ticket response is idempotent in any way, since a comment returns no id. | Open |
| 22 | Customers | Whether customer detail's `orders` covers only your account, and the terms for using rating stats, which describe other vendors' orders. | Open |
| 23 | Labels | What a barcode should encode, whether a printable label exists, how to set `handling` at create, and which orders have a non-vendor `from`. | Open |
| 24 | Webhooks | Whether test webhooks carry the same headers as real ones. | Open |
| 25 | Branches | Raised by the live checks: what `branch_type: "Logistics"` means and whether such a branch can be a pickup or destination branch; how a branch's `surcharge` (which can be negative) relates to the rate; whether rate branch names are matched case-sensitively; whether a real rate can be `"0"`, and why an unknown `type` returns `{"charge": "0"}` instead of an error; whether the branch list will keep answering without a token. | Partly answered (observed, reported) |
| 26 | Comments | Raised by the live checks: whether the `pk` on API comment rows is the comment id, and whether it equals a webhook's `comment_id`. | Answered (reported) |
| 27 | Orders | Raised by the live checks: which values `vendor_return` takes (only the string `"False"` was seen; is a return `"True"`?), and whether money fields keep their types (decimal strings in the order detail and rates, a JSON number in the label's `cod_charge`). | Partly answered (reported) |

## Answers

Entries dated 2026-11-16 come from read-only calls to the production API with
one vendor's production token (26 calls, shapes only; see the sources in
[api-contract.md](api-contract.md)), or, where marked "reported", from the
reference integration's read-only check of its own production data on the same
day (several thousand parcels, late June to mid-November 2026). None is
confirmed by NCM; ask NCM to confirm each before go-live.

### 1. Hosts
2026-11-16, observed with the production token via read-only calls; not
confirmed by NCM. `https://portal.nepalcanmove.com` is the production host. It
takes the same `Authorization: Token <token>` header as the demo examples. The
account holder reports that demo and production tokens are separate [reported].
Still open: whether the demo shares any data with production.
Updated: api-contract.md (Basics: Host, Sandbox), SKILL.md.

### 3. Branch list and rate shapes
2026-11-16, observed with the production token via read-only calls; not
confirmed by NCM.
- `GET /api/v2/branches` returns one bare JSON array of every branch, not paged (649 that day). Items: `pk` (integer), `code`, `name`, `geocode`, `address`, `surcharge` (decimal string, can be negative), `phone`, `phone2`, `branch_type` (`Branch` or `Logistics`), `areas_covered` (one string), `province_name`, `district_name`. `geocode`, `address`, `areas_covered` and `phone2` can be `null`.
- It answers without a token, with the same list.
- `GET /api/v1/shipping-rate` returns `{"charge": "<decimal string>"}`. Only branch names work: a branch's `code` or `pk`, or an unknown name, gets HTTP 200 with an HTML error page. An unknown `type` gets `200 {"charge": "0"}`.

Updated: api-contract.md (Basics, Errors, endpoint catalog #1 and #2, Delivery
types, Branches and rates), SKILL.md.

### 6. Bulk status
2026-11-16, observed with the production token via read-only calls; not
confirmed by NCM. An id that doesn't exist is listed in `errors` as an integer,
while a known id in the same call is answered in `result`. Still open: the
maximum batch size, and other causes of an `errors` entry.

2026-11-16, reported from one platform's production data; not confirmed by
NCM. Parcels still at `Sent for Pickup` are listed under `errors`: on one day,
nearly all of that platform's parcels at that status were.
Updated: api-contract.md (endpoint catalog #9, Status history and bulk status).

### 7. COD and payment_status
2026-11-16, observed with the production token via read-only calls; not
confirmed by NCM. An undelivered parcel read `payment_status: "Delivery
Pending"`; the doc shows `"Completed"`. Still open: the full list of values,
what each means, how remittance is reported, and what follows a COD ticket.
Updated: api-contract.md (Order detail).

### 8. vref_id
2026-11-16, reported from one platform's production data; not confirmed by
NCM. NCM doesn't check `vref_id` for duplicates: dozens of values were each sent
by two or more shops on one account, and every parcel was created. Still open:
whether a parcel can be looked up by `vref_id`.
Updated: api-contract.md (Create an order), production-lessons.md (#23).

### 9. Old ticket path
2026-11-16, dropped: the reference integration moved to
`/api/v2/vendor/ticket/create/new` that day, so the answer no longer matters to
it. Other projects should move rather than ask.

### 10. Pickup tickets and fbranch
2026-11-16, reported from one platform's production data; not confirmed by
NCM. Create's `fbranch` needn't be an assigned pickup branch: that platform's
parcels usually name another branch, and the creates succeed. Still open: what
NCM uses `fbranch` for, whether a ticket's `branch` is matched
case-sensitively, and the error for a missing or unassigned branch.
Updated: api-contract.md (Create an order), checklists.md (D10).

### 11. Ticket status
2026-11-16, reported from one platform's production data; not confirmed by
NCM. The one closed ticket it had stored read `status: true`, which fits the
doc example's `false` for an open ticket. Still open: NCM's confirmation.
Updated: api-contract.md (Tickets).

### 12. Comment webhooks
2026-11-16, reported from one platform's production data; not confirmed by
NCM. `comment_added` carries `event`, `order_id` and `comment_id` (digit
strings), `comment`, `comment_type` (`Info`, rarely `Action`), `display`
(`External`), `status` (the text `"None"`) and a UTC `timestamp`, and no author
field. Comment webhooks also kept arriving at a URL whose secret matched no
shop. Still open: how to set the comment webhook URL through the API.
Updated: webhooks-and-statuses.md (Events), checklists.md.

### 13. Statuses and events
2026-11-16, reported from one platform's webhooks, mid-July to mid-November;
not confirmed by NCM. All ten documented events arrived, plus three that aren't
documented: `comment_added`, `returned_to_warehouse` (with a `returnReason`)
and, rarely, `exchange_initiated`. Some documented events carry extra fields.
The largest bulk event held 100 ids. Still open: NCM's official lists of
statuses and events, and whether 100 ids is the cap.
Updated: webhooks-and-statuses.md (Events, Status vocabulary, Mapping
template).

### 14. Undocumented order fields
2026-11-16, observed with the production token via read-only calls; not
confirmed by NCM. The production order detail carries `vendor_return` (the
**string** `"False"`, not a boolean), `trackid` (a string), `active` (a
boolean), `delivered_date` (`null` before delivery), and two more:
`destination_branch_name` and `destination_branch_phone`. Each status-history
row also carries `vendor_return`. `GET /api/v2/vendor/order/redirectable`
exists and returns the paged `{count, next, previous, results: [{orderid,
branch, last_delivery_status}]}` the reference integration assumes, 10 to a
page. Still open: whether vendors may rely on these fields and that endpoint.
Updated: api-contract.md (endpoint catalog #3 and #6, Order detail, Status
history and bulk status, Undocumented endpoints), SKILL.md.

### 15. Webhook order
2026-11-16, reported from one platform's webhooks; not confirmed by NCM. Across
thousands of parcels with two or more status webhooks, none received an event
older than one it had already received. That isn't a promise: keep the
ordering rules. Still open: NCM's statement.
Updated: webhooks-and-statuses.md (Events).

### 18. COD 0
2026-11-16, reported from one platform's production data; not confirmed by
NCM. Parcels created with `cod_charge` 0 were delivered, so NCM accepts it.
Still open: what the rider collects for such a parcel.
Updated: api-contract.md (Create an order), checklists.md (D5).

### 19. Branch ids
2026-11-16, observed with the production token via read-only calls; not
confirmed by NCM. The branch list carries an integer `pk` and a `code` for each
branch. The rate endpoint accepts neither: it takes names only. Still open:
whether the redirect's `destination` takes the branch `pk` (redirect wasn't
called), and whether the label's `code` is accepted anywhere.
Updated: api-contract.md (Branches and rates, Redirect).

### 20. Status strings
2026-11-16, observed with the production token via read-only calls; not
confirmed by NCM. `Returned to Warehouse` is a real order status: every parcel
on the first page of `/order/redirectable` had it as `last_delivery_status`.
That it is the status behind the `returned_to_warehouse` event is [inferred].

2026-11-16, reported from one platform's production data; not confirmed by
NCM. `Dispatched to <BRANCH>` and `Arrived at <BRANCH>` are real: the
status-history API sends them, often, while webhooks say `Dispatched` and
`Arrived`. `<BRANCH>` can be a return branch, such as `RETURN ( TINKUNE)`.
`Out for Delivery` and `Delivery Attempted` never came in four and a half
months. `Returned to Warehouse` is in the status history from late July. Still
open: what `Returned to Warehouse` and the `returned_to_warehouse` event mean.
Updated: webhooks-and-statuses.md (Status vocabulary, Mapping template),
api-contract.md (Undocumented endpoints).

### 25. Branches and rates
2026-11-16, observed with the production token via read-only calls; not
confirmed by NCM. Rate branch names appear to be matched case-insensitively:
`Tinkune`/`Pokhara` gave the same charge as `TINKUNE`/`POKHARA` (lowercase
wasn't tried). Still open: `Logistics` branches, `surcharge`, whether a real
rate can be `"0"`, and whether the branch list keeps answering without a token.

2026-11-16, reported from one platform's data; not confirmed by NCM. Of the
649 branches, 400 are `Logistics` (two with a negative surcharge) and 249 are
`Branch`. None of that platform's shops picks up from a `Logistics` branch. Its
branch sync has always run without a token.
Updated: api-contract.md (Branches and rates).

### 26. Comment ids
2026-11-16, reported from one platform's production data; not confirmed by
NCM. For every comment received both by webhook and from the API (thousands),
the API's `pk` equalled the webhook's `comment_id`. The two timestamps were
never identical, but almost always within a second.
Updated: api-contract.md (Comments), webhooks-and-statuses.md (Events),
checklists.md, production-lessons.md (#26).

### 27. vendor_return and money types
2026-11-16, reported from one platform's production data; not confirmed by
NCM. `vendor_return` was a string in every status-history row, `"False"` or
`"True"`, never a boolean, and returned parcels read `"True"`. Still open: NCM's
confirmation, and whether money fields keep their types.
Updated: api-contract.md (Order detail).

Format for an answer NCM gives:

```text
### 9. Old ticket path
2026-12-01, NCM IT, by email: "<answer>"
Updated: api-contract.md (Changes from the v1 doc, Tickets).
```
