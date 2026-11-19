# NCM API contract

Nepal Can Move (NCM) is a courier in Nepal. This file is the public API contract
as NCM's own documents state it, what changed from the previous API document,
what read-only calls to the live production API returned, and a short, clearly
marked list of behaviour seen in one production integration but not in those
documents.

**Sources**

- *NCM API Documentation*, version 2 (PDF file name `NCM API DOC V2.pdf`, 32 pages, created 2026-06-21; the document itself carries no version number or date). Called **API doc** below. "v2" is the document's version, not a path prefix: create, detail, status, comments and rates are still under `/api/v1/`.
- *NCM Webhook Integration Documentation*, version 1.1, "Last updated: September 2026", status "Beta (subject to changes)". Called **Webhook doc**. Its contract is in [webhooks-and-statuses.md](webhooks-and-statuses.md). It is the current webhook document, unchanged since the previous edition of this skill; its version number is its own and unrelated to the API doc's.
- *NCM API Documentation* (PDF, file name dated `251222`, 18 pages), the API document v2 replaces. Called **v1 doc**. The API doc restates every v1 endpoint with identical text, except the rows marked breaking in [Changes from the v1 doc](#changes-from-the-v1-doc).
- **Live read-only calls**, 2026-11-16: 26 calls to `https://portal.nepalcanmove.com` with one vendor's production token (24 GETs and two read-only POSTs, bulk status and bulk labels), at most one every 2.5 s. Only response shapes and header names were recorded: key names, value types and counts, plus enum-like values and amounts. Nothing was created or changed: no order, comment, ticket, return, exchange, redirect or webhook call was made. Endpoints #7, #8, #10–#12, #14–#17, #19–#21, #23 and #24 weren't called; the undocumented `/order/redirectable` was. Results are labelled **[observed 2026-11-16]**; every example built from them uses invented values.
- **Production data check**, 2026-11-16: the reference integration's team queried its own production database read-only, with every transaction rolled back. It covered several thousand parcels from a multi-shop platform: NCM status history from late June to mid-November 2026, and every webhook received from mid-July to mid-November. Its findings are labelled **[reported]**, like the team's earlier production checks; NCM hasn't confirmed them.

**Labels used**

- **[doc]** stated by the current documents (API doc v2, webhook doc v1.1). Example values below are adapted from the documents' examples, with ids, names and dates changed.
- **[v1 doc]** stated only in the superseded v1 doc and dropped from the API doc. Kept so you can recognise and migrate old code; don't build on it.
- **[inferred]** follows from the documents without being stated in them.
- **[observed]** (no date) seen in one production integration's code, not in NCM's documents. Code shows what the integration *handles*, not what NCM *sends*; confirm with NCM before you depend on it.
- **[observed 2026-11-16]** returned by NCM's production API to a read-only call on that date, for one vendor account (see Sources). It shows what NCM *sent*, not what it promises: NCM hasn't confirmed it in writing, and it may change. It never counts as [doc].
- **[reported]** that integration's team reports it from production checks, or the holder of the production token used for the live calls reports it from their account; not visible in the integration's code, and not checked here.
- **[unknown]** no source settles it, including everything the API doc leaves unspecified. Don't fill the gap with a guess.
- **[NCM, date]** answered by NCM outside its documents (email, call, ticket); the answer is recorded in [open-questions.md](open-questions.md#answers).

## Changes from the v1 doc

| Area | v1 doc [v1 doc] | API doc v2 [doc] | What to do |
|---|---|---|---|
| Generic ticket path | `POST /api/v2/vendor/ticket/create` | `POST /api/v2/vendor/ticket/create/new` | **Breaking.** Move to the new path. Whether the old path still answers is [unknown]; don't rely on it. |
| Pickup tickets | `{"ticket_type", "message"}` | adds `branch`, required when `ticket_type` is `Pickup`; it "must be one of the vendor's assigned pickup branches" | **Breaking.** Send a name from `GET /api/v2/vendor/assigned-branches` (#18). |
| Daily limits | 200 creates, 5,000 reads | 1,000 creates, 20,000 reads (detail, comments, status) | Resize budgets. Scope, reset and over-limit response are still [unknown]. |
| Webhook URL API | named only in the webhook doc, parameters unknown | documented: `{"webhook_url"}` (#17), plus a test endpoint (#19) | Register and test from code if you want to. |
| Ticket detail | not documented; seen in production [observed] | documented (#20) | Parse the documented shape. |
| Customer rating stats | not documented; seen in production [observed] | documented (#24) | Same shape that integration assumed. |
| New endpoints | none | assigned branches (#18), ticket response (#21), customer list and detail (#22, #23), label data for one or many orders (#25, #26) | Use only what the project needs. |
| Everything else | | identical text: auth, host, branch list, delivery rate, create, detail, comments, status history, bulk status, comment create, COD ticket, close ticket, staff, return, exchange, redirect, GET errors | No migration. **Don't rewrite `/api/v1/` paths to `/api/v2/`**: the API doc keeps them. |

Still missing from both: a cancel or hold endpoint, a webhook signature,
idempotency keys, a lookup by `vref_id`, the response shapes of the branch list
and the delivery rate, and a source of the branch ids a redirect needs. The
branch list and rate shapes have since been seen on the live API, and the branch
list carries a `pk` for each branch [observed 2026-11-16] (see [Branches and
rates](#branches-and-rates)). Whether that `pk` is the id a redirect takes is
still [unknown].

## Basics

| Topic | Contract |
|---|---|
| Host | Every example uses `https://demo.nepalcanmove.com` [doc]. The documents don't name the production host. Production is `https://portal.nepalcanmove.com`: it answered a production vendor token sent in the same `Authorization: Token <token>` header [observed 2026-11-16]. Demo and production tokens are separate [reported]: use each token only on its own host. Keep the base URL in configuration, next to the token, never as a constant. |
| Auth | Header `Authorization: Token <api-token>` [doc]. "Every vendor is provided with an API Token Key"; a new or forgotten token comes from NCM's IT admin [doc]. |
| Token scope | One token per vendor (merchant) account [doc]. The integration's code assumes order ids are per-account sequences and that one account's token can't read another's orders [observed]; in one production check the platform token answered for none of 168 ids created under shops' own tokens [reported]. The label endpoints, new in v2, say "only the authenticated vendor's own orders", and the return endpoint (unchanged from the v1 doc) says "Only the vendor who owns the order" [doc]; the order reads say nothing either way. |
| Content type | `Content-Type: application/json` on POST examples [doc]. |
| Daily limits | "Order Creation : 1,000 per day"; "Order View (Detail, Comments, Status ): 20,000 per day" [doc]. Normal responses carry no rate-limit headers: no `X-RateLimit-*`, no `Retry-After` [observed 2026-11-16]. You can't read the remaining budget from NCM, so count your own calls. Whether the limit is per token, when it resets, what the response is when exceeded, and whether bulk status, labels, customers, ratings and tickets count against the 20,000: [unknown]. The v1 doc's 200 and 5,000 are superseded [v1 doc]. |
| Conduct | "Avoid duplication of order creation from both bulk file upload and api system." "No Spamming or running scripts to overload the server." [doc] |
| Versioning | Paths mix `/api/v1/`, `/api/v1/vendor/`, `/api/v2/` and `/api/v2/vendor/` [doc]; the version belongs to each path, not to the document. Ticket replies are under `/api/v1/vendor/tickets/` (plural) while create and close are under `/api/v2/vendor/ticket/` (singular). No deprecation policy is documented, and the v1 doc's ticket path vanished without a note [unknown]. |
| Pagination | `count`, `next`, `previous`, `results` for the staff list (default 20 per page) and the customer list (default 25, maximum 100) [doc]; both answered in that envelope, with `next` a string and `previous` `null` on the first page [observed 2026-11-16]. The branch list isn't paged: it returned one bare JSON array of every branch, 649 entries and about 240 KB [observed 2026-11-16]. |
| Id fields | Responses don't agree on the id's name [observed 2026-11-16]: branches, staff and comments carry `pk`, customers carry `id`, orders carry `orderid`. The staff list is documented with `id` but returned `pk`. Read the field each endpoint actually sends. |
| Money | Decimal **strings** with two decimals in the order detail (`cod_charge`, `delivery_charge`), the rate (`charge`) and the branch `surcharge`, which can be negative [observed 2026-11-16]. The label's `cod_charge` came back as a JSON **number** [observed 2026-11-16], unlike the order detail's. A rate for an unknown `type` is the string `"0"`, with no decimals (see [Errors](#errors)). Accept both strings and numbers, and parse money as a decimal, never as a float. A JSON number becomes a float in most JSON parsers before your code sees it, so parse numbers as decimals (Python: `json.loads(body, parse_float=Decimal)`), or round to two decimals at once and store integer paisa. Converting a float to a decimal afterwards keeps the float's error. |
| Response envelope | The webhook and ticket-detail/response endpoints (#17, #19, #20, #21) put `"success": true/false` in the body [doc]. Treat `success: false` as a failure even inside an HTTP 200. The webhook test (#19) answers 200 in all four documented outcomes, and its `success: true` only means NCM reached your server: that test passed only if `status_code` is 2xx. |
| Sandbox | The documents are written against the demo host. Demo and production tokens are separate [reported]; whether the demo shares any data with production is [unknown]. |

## Errors

| Situation | Response [doc] |
|---|---|
| GET without a token | `401 {"detail": "Authentication credentials were not provided."}` (also shown for the bulk label POST) |
| GET without `id` | `400 {"detail": "ID parameter missing"}` |
| GET with an unknown or invalid id | `404 {"detail": "Not found."}`. The doc lists `500 {"detail": "Server Error"}` under the same heading, so a 500 from an order read may mean a bad id rather than a passing fault. Don't retry it blindly. |
| Order create, bad fields | `400 {"Error": {"<field>": "<message>", ...}}` |
| Comment create, bad fields | `400 {"Error": {"Order Id": "...", "Comments": "..."}}` |
| Return, missing id | `400 {"message": "Order ID is required"}` |
| Return, unknown order | `404 {"message": "Order not found"}` |
| Webhook URL not `http://` or `https://` | `400 {"success": false, "message": "Please enter a valid URL for Order Status Webhook (must start with http:// or https://)"}` |
| Webhook test, timeout or no connection | `200 {"success": false, "error": "Request timed out. ..."}` or `"Connection error. ..."` |
| Customer detail, unknown id | `404 {"detail": "Customer not found"}` or `404 {"detail": "Not found"}` |
| Rating stats, no phone; unknown phone | `400 {"detail": "phone parameter is required"}`; `404 {"detail": "No customer found with this phone number"}` |
| Label, unknown order | `404 {"detail": "Order not found"}`. What another vendor's id returns isn't stated [unknown]; the bulk endpoint puts those in `not_found`. |
| Bulk labels, empty or missing `ids` | `400 {"detail": "\"ids\" must be a non-empty array"}` |

Error bodies use four shapes: `detail`, `Error` (an object keyed by field),
`message`, and `success: false` with `message` or `error`. Parse all of them.
Not documented [unknown]: the response to a rate limit (for example 429), the
"forbidden" answer from ticket detail, and errors from ticket create, COD
ticket, close, staff, exchange, redirect, assigned branches and ticket
response. Expect HTML error pages, from proxies and, with HTTP 200, from the
rate endpoint itself (below). Never show a raw body to an end user.

**Seen on production** [observed 2026-11-16]. Each row comes from one read-only
call; none is confirmed by NCM.

| Situation | Response |
|---|---|
| Order detail without `id` | `400 {"detail": "ID parameter missing"}`, as documented |
| Order detail, an id that doesn't exist | `404 {"detail": "Not found."}`, as documented |
| Bulk status with an id that doesn't exist | `200`; that id is listed in `errors` as an integer, and the known id is answered in `result` |
| Rate with an unknown `type`, including `B2D`, which isn't one of the four documented types | `200 {"charge": "0"}`. **Not an error status.** |
| Rate with a branch `code` or `pk` in place of the name, or a branch name NCM doesn't know | `200` with an HTML page titled "Sorry, Something went wrong", not JSON |
| Branch list without a token | `200` with the full list: it needs no token |

So a rate request can fail with HTTP 200 in two ways. Treat a body that isn't
JSON, or a `charge` of `"0"`, as a failed quote: never show it as free delivery.

## Endpoint catalog

Every endpoint takes `Authorization: Token <api-token>` unless the row says otherwise. Numbers are this file's own, kept stable across editions.

| # | Purpose | Method and path | Request | Success response [doc] |
|---|---|---|---|---|
| 1 | Branch list with details (phone, covered areas, district, region) | `GET /api/v2/branches` | none | Shape **not documented** in the doc, which shows no auth header for this one. Live: `200`, one bare array of every branch, not paged, and the same answer with no token [observed 2026-11-16]. Each item is `{"pk", "code", "name", "geocode", "address", "surcharge", "phone", "phone2", "branch_type", "areas_covered", "province_name", "district_name"}` [observed 2026-11-16]; see [Branches and rates](#branches-and-rates). It is the only response that carries a branch id (`pk`). Whether that is the id the redirect's `destination` needs is [unknown]; one integration reads branch ids here [observed]. |
| 2 | Delivery charge between branches | `GET /api/v1/shipping-rate?creation=<from>&destination=<to>&type=<type>` | query `creation` (pickup branch), `destination` (destination branch), `type` (below). The doc's example uses branch **names** in capitals (`creation=TINKUNE&destination=POKHARA`) [doc]. Only names work: a branch `code` or `pk` gets the same HTML error page as an unknown name [observed 2026-11-16]. | Shape **not documented** in the doc. Live: `200 {"charge": "<decimal string>"}`; an unknown `type` gets `200 {"charge": "0"}` [observed 2026-11-16]. |
| 3 | One order's detail | `GET /api/v1/order?id=<ncm-order-id>` | query `id` | `{"orderid", "cod_charge", "delivery_charge", "last_delivery_status", "payment_status"}`. Live: those five plus `vendor_return` (a **string**), `trackid`, `active`, `delivered_date`, `destination_branch_name` and `destination_branch_phone` [observed 2026-11-16]; see [Order detail](#order-detail). |
| 4 | One order's comments, newest first | `GET /api/v1/order/comment?id=<ncm-order-id>` | query `id` | array of `{"orderid", "comments", "addedBy", "added_time"}`. Live: each item also carries `pk`, an integer [observed 2026-11-16]. |
| 5 | Last 25 comments across the account's orders | `GET /api/v1/order/getbulkcomments` | none | same item shape as #4. Live: 25 items, `pk` included [observed 2026-11-16]. |
| 6 | One order's status history, newest first | `GET /api/v1/order/status?id=<ncm-order-id>` | query `id` | array of `{"orderid", "status", "added_time"}`. Live: each item also carries `vendor_return`, a string [observed 2026-11-16]. |
| 7 | Create an order | `POST /api/v1/order/create` | JSON, see [Create an order](#create-an-order) | `200 {"Message": "Order Successfully Created", "orderid": <int>}` |
| 8 | Add a comment to an order | `POST /api/v1/comment` | `{"orderid", "comments"}`, both required | `200 {"message": "Comment successfully created"}` |
| 9 | Current status of many orders | `POST /api/v1/orders/statuses` | `{"orders": [<int>, ...]}` | `200 {"result": {"<id>": "<status>"}, "errors": [<id>, ...]}`. Live: as documented; an id that doesn't exist is listed in `errors` as an integer [observed 2026-11-16]. |
| 10 | Support ticket, including pickup requests | `POST /api/v2/vendor/ticket/create/new` | `{"ticket_type", "message", "branch"?}`; `message` max 500 chars; `branch` required for `Pickup`. See [Tickets](#tickets). | `201 {"message": "Ticket created", "ticket": <int>}`. The v1 doc's path `/api/v2/vendor/ticket/create` is gone [v1 doc]. |
| 11 | COD transfer request ticket | `POST /api/v2/vendor/ticket/cod/create` | `{"bankName", "bankAccountName", "bankAccountNumber"}`, all required | `201 {"message": "COD ticket created", "ticket": <int>}` |
| 12 | Close own ticket | `POST /api/v2/vendor/ticket/close/<ticket_id>` | ticket id in the path (`pk`) | `200 {"message": "Ticket closed", "ticket": <int>}` |
| 13 | Active staff list | `GET /api/v2/vendor/staffs?q=&page=&page_size=` (`limit` is an alias of `page_size`) | all optional; `page` default 1, `page_size` default 20 | `{"count", "next", "previous", "results": [{"id", "name", "email", "phone"}]}`. Live: items carry `pk`, **not** `id`, plus `role` (a string) and `status` (a boolean) [observed 2026-11-16]. |
| 14 | Mark an order for return | `POST /api/v2/vendor/order/return` | `{"pk": <order id>, "comment"?}` | `200 {"message": "Order marked for return successfully", "order": <int>, "vendor_return": true}` |
| 15 | Exchange (replacement plus pickup of the old item) | `POST /api/v2/vendor/order/exchange-create` | `{"pk": <original order id>}` | `200 {"message": "Exchange orders created", "cust_order": <int>, "ven_order": <int>}` |
| 16 | Redirect to another address or customer | `POST /api/v2/vendor/order/redirect` | see [Redirect](#redirect) | `200 {"message", "order", "cod_charge", "delivery_charge", "changelogs"}` |
| 17 | Set or remove the order status webhook URL | `POST /api/v2/vendor/webhook` | `{"webhook_url": "<http(s) URL>"}`; `""` removes it. See [Webhook registration and test](#webhook-registration-and-test). | `201 {"success": true, "message": "Webhook URLs created successfully!"}` the first time, then `200 {"success": true, "message": "Webhook URLs updated successfully!"}` |
| 18 | Pickup branches assigned to the account | `GET /api/v2/vendor/assigned-branches` | none | `200 ["<BRANCH NAME>", ...]`: names only; `[]` when none are assigned. Live: as documented, an array of strings [observed 2026-11-16]. |
| 19 | Send a test webhook | `POST /api/v2/vendor/webhook/test` | `{"webhook_url": "<url>"}` | `200` in every documented outcome, failures included; read `success` and `status_code` |
| 20 | One ticket with its responses | `GET /api/v1/tickets/<ticket_id>/detail` | ticket id in the path; a vendor sees only its own tickets | `200 {"success": true, "ticket": {...}, "responses": [...]}` |
| 21 | Reply to a ticket | `POST /api/v1/vendor/tickets/<ticket_id>/response` | `{"message"}` | `201 {"success": true, "ticket_id": <int>, "response": {"id", "message", "added_on", "vendor_display", "added_by": {"id", "name"}}}`. **Reopens a closed ticket.** |
| 22 | The account's customers | `GET /api/v2/vendor/customers?page=&page_size=&name=&phone=` | all optional; `page_size` default 25, max 100; `name` contains, `phone` starts with | `{"count", "next", "previous", "results": [{"id", "name", "phone", "address"}]}`. Live: as documented, `id` included [observed 2026-11-16]. |
| 23 | One customer with order history | `GET /api/v2/vendor/customers/<customer_id>/detail` | customer id in the path | `{"id", "name", "phone", "email", "orders": [{"orderid", "created_date", "cod_charge", "delivery_charge", "last_delivery_status"}]}` |
| 24 | A phone's delivery record across NCM | `GET /api/v2/vendor/ratings?phone=<phone>` | `phone` required | `{"phone", "total_orders", "total_delivered", "total_returned"}` |
| 25 | Label data for one order | `GET /api/v2/vendor/order/label/<order_id>` | order id in the path; own orders only | a label object, see [Label data](#label-data). Live: the documented keys, but `cod_charge` is a JSON **number** [observed 2026-11-16]. |
| 26 | Label data for many orders | `POST /api/v2/vendor/order/label/` (trailing slash as documented) | `{"ids": [<int>, ...]}`, non-empty | `200 {"labels": [<label>, ...], "not_found": [<id>, ...]}`. Live: as documented; an id that doesn't exist is listed in `not_found` as an integer, and labels carry `cod_charge` as a JSON number [observed 2026-11-16]. |

Not offered by the documents: cancelling an order, creating an order on hold, a
dedicated pickup-request endpoint (a `Pickup` ticket stands in), a COD
remittance or settlement statement, idempotency keys, a lookup by `vref_id`, a
printable label or AWB file (#25 and #26 return label **data**), reading back
the registered webhook URL.

### Delivery types

The rate endpoint and the create endpoint name the four services differently,
and the label endpoints add a third, coarser vocabulary. The rate table
describes each `type` with the words create takes as `delivery_type`
(`Pickup/Collect` is "Door2Door (NCM pickup & delivery)", `D2B` is "Door2Branch
(...)"), so the pairing is all but stated. The doc never says outright to send
one for the other, so the pairing below is marked [inferred]; the names and
charges in each row are [doc]. The label column is [doc]: labels report
`Office` for D2B and B2B orders and `Home` for all others.

| Service | Rate `type` | Create `delivery_type` | Label `delivery_type` | Charge, as the rate table words it |
|---|---|---|---|---|
| NCM picks up from the sender and delivers to the door | `Pickup/Collect` | `Door2Door` (the default) | `Home` | full base charge |
| Sender drops at a branch, NCM delivers to the door | `Send` | `Branch2Door` | `Home` | full base charge |
| NCM picks up, customer collects at a branch | `D2B` | `Door2Branch` | `Office` | base charge − 50 |
| Sender drops at a branch, customer collects at a branch | `B2B` | `Branch2Branch` | `Office` | base charge − 50 |

"Base charge − 50" is the doc's wording; it gives no unit or base. Read the
charge from the rate endpoint; never compute it yourself. Keep one mapping table
in code. Don't send a rate `type` to the create endpoint, and never send a label
value (`Home`, `Office`) to either.

[observed 2026-11-16] For one pair of branches, `Pickup/Collect` and `Send`
returned the same charge, and `D2B` and `B2B` returned 50 less, as the table
says. `B2D` isn't a rate type: like any unknown `type`, it got
`200 {"charge": "0"}` instead of an error. Send exactly one of the four
documented values.

### Branches and rates

`GET /api/v2/branches` returns one bare JSON array of every branch, with no
paging and no envelope [observed 2026-11-16]. Invented values, observed shape:

```json
[
  {
    "pk": 101,
    "code": "EXMPL1",
    "name": "EXAMPLE BRANCH",
    "geocode": "<geocode>",
    "address": "Example Road",
    "surcharge": "25.00",
    "phone": "0100000000",
    "phone2": null,
    "branch_type": "Branch",
    "areas_covered": "<covered areas, one string>",
    "province_name": "Example Province",
    "district_name": "Example District"
  }
]
```

- 649 branches that day, about 240 KB. Cache the list and refresh it on a schedule, not per request.
- It answered without a token with the same list, and answers with one too [observed 2026-11-16]. Send the token anyway: the doc promises nothing either way, and NCM could start requiring it.
- `pk` is an integer and is the only branch id any response carries. The redirect's `destination` needs a branch id; whether it is this `pk` is [unknown], since redirect wasn't called.
- `branch_type` was `Branch` or `Logistics`. What `Logistics` means, and whether such a branch can be a pickup or destination branch, is [unknown].
- `surcharge` is a decimal string and can be negative. How it relates to the rate is [unknown]; take the charge from the rate endpoint.
- `geocode`, `address`, `areas_covered` and `phone2` can be `null`. `areas_covered` is one string, not a list, and `phone2` isn't always digits only; their formats are [unknown]. `phone` was digits only.

`GET /api/v1/shipping-rate?creation=TINKUNE&destination=POKHARA&type=Pickup/Collect`
→ `200 {"charge": "150.00"}` (the amount is invented) [observed 2026-11-16].

- `charge` is a decimal string with two decimals.
- Only branch **names** work. A branch's `code` or `pk`, or a name NCM doesn't know, gets HTTP `200` with an HTML page titled "Sorry, Something went wrong".
- An unknown `type` gets `200 {"charge": "0"}`, with no decimals.
- Before using a quote, check that the body is JSON and that `charge` isn't `"0"`. Whether a real charge can ever be `"0"` is [unknown].
- Names appear to be matched case-insensitively: `Tinkune` and `Pokhara` gave the same charge as `TINKUNE` and `POKHARA` [observed 2026-11-16]. Only title case was tried; send the capitals the doc uses anyway.

### Create an order

`POST /api/v1/order/create` [doc]

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | customer name |
| `phone` | yes | customer phone |
| `phone2` | no | secondary phone |
| `cod_charge` | yes | "cod amount including delivery": the cash NCM collects from the customer |
| `address` | yes | general address of the customer |
| `fbranch` | yes | **name** of the origin (from) branch |
| `branch` | yes | **name** of the destination branch |
| `package` | no | package name or type |
| `vref_id` | no | vendor reference id: your own order reference |
| `instruction` | no | delivery instruction |
| `delivery_type` | no | `Door2Door`, `Branch2Door`, `Branch2Branch`, `Door2Branch`; default `Door2Door` |
| `weight` | no | kg; default 1 |

The example sends every value as a JSON string, numbers included [doc]. Not
documented [unknown]: field length limits, accepted phone formats, whether
`cod_charge` may be `"0"` for a prepaid order, whether `vref_id` must be unique
or is checked for duplicates, whether `fbranch` must be one of the account's
assigned pickup branches (#18), and how to mark a parcel fragile or valuable
(the label reports a `handling` value, but create has no field for it).

What one platform's production data shows [reported]:

- **`vref_id` isn't checked for duplicates.** Dozens of `vref_id` values were each sent by two or more shops on one account, and NCM created every parcel. Make your references unique per account yourself; NCM won't catch a repeat.
- **`cod_charge: "0"` is accepted.** Parcels created with COD 0 were delivered. What the rider then collects is [unknown].
- **`fbranch` needn't be an assigned pickup branch.** That platform's parcels usually name an `fbranch` that isn't one, and the creates succeed. What NCM uses `fbranch` for is [unknown].

Synthetic request:

```json
{
  "name": "Test Customer",
  "phone": "98XXXXXXXX",
  "phone2": "",
  "cod_charge": "1500",
  "address": "Example Tole, Ward 1",
  "fbranch": "<ORIGIN_BRANCH_NAME>",
  "branch": "<DESTINATION_BRANCH_NAME>",
  "package": "1 x Example item",
  "vref_id": "SHOP-ORDER-0001",
  "instruction": "Call before delivery",
  "delivery_type": "Door2Door",
  "weight": "1"
}
```

Success: `200 {"Message": "Order Successfully Created", "orderid": 1001}`. Note the capital `M` in `Message`. The `orderid` is the NCM order id every later call takes.

Failure: `400 {"Error": {"phone": "Invalid Phone Number", "branch": "Invalid Branch"}}`. The documented messages are `"Invalid COD Amount"`, `"Invalid Phone Number"`, `"Invalid Branch"`, `"Invalid Name"`, `"Invalid Address"`.

**No idempotency.** Nothing in the contract stops a retried create making a second parcel [doc: no such mechanism is described]. See [checklists.md](checklists.md) for the claim-before-call pattern.

**Finding a parcel after a timed-out create** [inferred]. The API still can't
look a parcel up by `vref_id`, but the API doc's new endpoints allow a search:
filter customers by phone (#22), take that customer's orders (#23) created
around the time of the attempt, and read each candidate's label (#25), whose
`description.vendor_orderid` appears to echo `vref_id`. Show the person only
candidates whose label read succeeds: labels cover your own orders only, while
the `orders` from #23 may include other vendors' (see [Customers and rating
stats](#customers-and-rating-stats)). None of this is documented for the
purpose. Whether a new order shows up there at once, and whether
`vendor_orderid` is `vref_id`, are [unknown]. Use it to help a person resolve an
`unknown` create, never to justify an automatic retry.

### Order detail

`GET /api/v1/order?id=1001` → [doc]

```json
{
  "orderid": 1001,
  "cod_charge": "1500.00",
  "delivery_charge": "150.00",
  "last_delivery_status": "Delivered",
  "payment_status": "Completed"
}
```

A production order that was waiting for pickup returned the five documented
fields and six more [observed 2026-11-16]. Invented values, observed shape:

```json
{
  "orderid": 1001,
  "cod_charge": "1500.00",
  "delivery_charge": "150.00",
  "last_delivery_status": "Sent for Pickup",
  "payment_status": "Delivery Pending",
  "vendor_return": "False",
  "trackid": "<tracking id>",
  "active": true,
  "delivered_date": null,
  "destination_branch_name": "<DESTINATION_BRANCH_NAME>",
  "destination_branch_phone": "0100000000"
}
```

- Money is a decimal **string** [doc], with two decimals [observed 2026-11-16]. Parse it as a decimal, never as a float.
- `payment_status` was `"Delivery Pending"` on that undelivered parcel [observed 2026-11-16]; the doc shows `"Completed"`. The full list, and what `"Completed"` means (cash collected from the customer, or paid out to the vendor), are **not documented** [unknown]. Don't read either as "the vendor has been paid".
- **`vendor_return` is a string**: `"False"` in the observed response [observed 2026-11-16]. A non-empty string is truthy in most languages, so `if detail["vendor_return"]` takes `"False"` for a return. One platform's production data had it as a string in every status-history row, `"False"` or `"True"`, never a boolean; returned parcels read `"True"` [reported]. Read `"true"` in any case, or a boolean `true`, as true (the return endpoint's documented response uses a boolean [doc]); read `"false"` in any case, or `false`, as false; flag any other value for a person rather than guessing. One integration's production data holds NCM's `vendor_return` answers for many parcels [reported], and its return handling depends on them. How its parser converts the string isn't recorded here [unknown]; check how yours does.
- `trackid` (a string), `active` (a boolean) and `delivered_date` (`null` before delivery) are present too [observed 2026-11-16]. That integration's parser reads them [observed]. `destination_branch_name` and `destination_branch_phone` are new. None of these six fields is documented; confirm with NCM before depending on one.

### Status history and bulk status

`GET /api/v1/order/status?id=1001` returns newest first [doc]:

```json
[
  {"orderid": 1001, "status": "Delivered",            "added_time": "2026-01-02T13:24:30.960365+05:45"},
  {"orderid": 1001, "status": "Sent for Delivery",    "added_time": "2026-01-02T13:22:21.033595+05:45"},
  {"orderid": 1001, "status": "Pickup Complete",      "added_time": "2026-01-02T13:17:25.326792+05:45"},
  {"orderid": 1001, "status": "Sent for Pickup",      "added_time": "2026-01-02T13:15:24.313074+05:45"},
  {"orderid": 1001, "status": "Pickup Order Created", "added_time": "2025-12-30T11:32:18.149352+05:45"}
]
```

`added_time` carries a `+05:45` offset (Nepal) in the examples [doc], and did live [observed 2026-11-16]. Sort by the parsed time rather than trusting array order. Live rows also carry `vendor_return`, a string such as `"False"` [observed 2026-11-16]; parse it as in [Order detail](#order-detail).

`POST /api/v1/orders/statuses` with `{"orders": [1001, 1002, 1003, 1004, 1005]}` [doc]:

```json
{
  "result": {"1001": "Pickup Order Created", "1002": "Arrived", "1004": "Drop off Order Created", "1005": "Delivered"},
  "errors": [1003]
}
```

- Ids go in as integers and come back as **string keys** [doc], while `errors` holds integers [observed 2026-11-16]. Normalise both to one type before you check which of the ids you sent were answered; otherwise every id looks unanswered, or every error is missed.
- `errors` lists ids NCM could not answer for. An id that doesn't exist lands there as an integer, while a known id in the same call is answered in `result` [observed 2026-11-16]. Other causes of an error entry are [unknown].
  - [observed] One integration found most of its long-stuck parcels listed here, while control parcels on the same token answered normally.
  - [reported] Parcels still at `Sent for Pickup` land here: on one day, nearly all of one platform's parcels at that status were listed under `errors`. Don't read an error entry as "lost"; check the parcel's status history.
  - [reported] Ids created under another account's token went unanswered in one production check, so group ids by the token that created them.
- Maximum batch size: [unknown]. One integration uses 100.
- Whether a bulk call counts as one read or one per id against the 20,000 daily reads: [unknown].

### Comments

`GET /api/v1/order/comment?id=1001` → newest first [doc]:

```json
[{"orderid": 1001, "comments": "Customer not reachable", "addedBy": "NCM Staff", "added_time": "2026-01-02T16:43:15.687200+05:45"}]
```

`addedBy` values seen in the doc: `"NCM Staff"`, `"Vendor"`. Comment ids are **not** in the documented response [doc]; one integration's code notes that the comment list "has not always included comment_id" and reads it when present [observed]. Live, every row from both comment endpoints (#4, #5) carried `pk`, an integer [observed 2026-11-16]. It is the comment's id: for every one of thousands of comments one platform received both ways, the API's `pk` equalled the webhook's `comment_id` (a digit string there) [reported].

De-duplicate on (account, NCM order id, comment id), taking `pk` from API rows
and `comment_id` from webhooks, compared as the same type. Fall back to text
and time only when neither id is present, and then match the time **within a
tolerance**: the API's `added_time` and the webhook's `timestamp` for one
comment were never identical, though almost always within a second [reported].
Webhooks carry no author field, so don't key on `addedBy` across channels.
Reading `comment_id` from API rows, which have only `pk`, stored every NCM
comment twice in one integration ([production-lessons.md](production-lessons.md#behaviour-not-to-copy)).
Your own comments come back with `addedBy: "Vendor"`; match them to the local
comment by text within a few minutes rather than storing them twice.

`GET /api/v1/order/getbulkcomments` returns the last 25 comments across the account's orders, "latest comments ... at the top" [doc]; it returned 25 rows [observed 2026-11-16]. The doc's own example is not strictly newest first, so sort locally. With only 25 rows, a busy account can lose comments between polls; use it as a supplement, not the only feed.

`POST /api/v1/comment` with `{"orderid": "1001", "comments": "Please call before 5pm"}` → `200 {"message": "Comment successfully created"}` [doc]. No comment id comes back [doc]. A length limit is [unknown].

**A comment post isn't idempotent.** After a timeout or a 5xx, NCM may already
have stored the comment. Before posting again, read the thread
(`GET /api/v1/order/comment?id=`) and look for the same text from `Vendor`.

### Tickets

**Create** `POST /api/v2/vendor/ticket/create/new` [doc]

| Field | Required | Meaning |
|---|---|---|
| `ticket_type` | yes | `General`, `Order Processing`, `Return` or `Pickup` |
| `message` | yes | at most 500 characters |
| `branch` | only for `Pickup` | "must be one of the vendor's assigned pickup branches" (#18) |

Synthetic pickup request, in the doc example's message format:

```json
{"ticket_type": "Pickup", "message": "98XXXXXXXX, No. of Packets: 5, Address: Example Tole", "branch": "<ASSIGNED_BRANCH_NAME>"}
```

→ `201 {"message": "Ticket created", "ticket": 2001}` [doc].

- The doc's example sends `"branch": "Tinkune"`, while #18 returns names in capitals (`"KATHMANDU"`) [doc]. Whether the match is case-sensitive is [unknown]; send the name exactly as #18 returns it.
- The error for a missing or unassigned `branch` is [unknown].
- There is still no dedicated pickup endpoint. A `Pickup` ticket is how you ask NCM to collect [inferred from the ticket types and the example].
- Whether a ticket type is meant for cancelling an order is [unknown]; none is named for it.

**COD transfer** `POST /api/v2/vendor/ticket/cod/create` with `bankName`,
`bankAccountName` and `bankAccountNumber` → `201 {"message": "COD ticket
created", "ticket": <int>}` [doc]. The bank details are sensitive: never log
them, and confirm with the business who may file one. What NCM does next, and
how a transfer is reported back, is [unknown].

**Close** `POST /api/v2/vendor/ticket/close/<ticket_id>` → `200 {"message": "Ticket closed", "ticket": <int>}`, for your own tickets [doc].

**Detail** `GET /api/v1/tickets/<ticket_id>/detail` [doc]. A vendor sees only its own tickets; "other roles are forbidden".

```json
{
  "success": true,
  "ticket": {
    "id": 2001,
    "ticket_type": "Pickup",
    "message": "98XXXXXXXX<br>No. of Packets: 5<br>Address: Example Tole<br>Actual Pickup count : 4",
    "added_on": "2026-01-05T11:28:00+05:45",
    "status": false,
    "comment": "",
    "attachment": null,
    "branch": "<ASSIGNED_BRANCH_NAME>",
    "closed_on": null,
    "vendor": {"id": 501, "name": "Example Vendor", "location": "27.70,85.30"},
    "assigned_to": {"id": 43, "name": "Example Logistics"},
    "closed_by": {"id": null, "name": null}
  },
  "responses": [
    {"id": 3001, "message": "Please pick up tomorrow morning.", "added_on": "2026-01-05T12:10:00+05:45", "vendor_display": true, "added_by": {"id": 501, "name": "Example Vendor"}}
  ]
}
```

- `status` is a boolean, and the doc doesn't say which value means open. The example pairs `false` with `closed_on: null`, so `false` is probably open [inferred]. The one closed ticket a platform had stored read `status: true` [reported], which fits. Read `closed_on` too, and confirm with NCM.
- `message` holds `<br>` line breaks, and the doc's example ends with an "Actual Pickup count" line the vendor didn't write [doc]. Turn the `<br>` into line breaks and escape the rest before display; never render it as HTML.
- In the doc's example the braces put `responses` beside `ticket`, at the top level, while the indentation suggests it sits inside `ticket` [doc]. Read it from either place.
- The shape of the "forbidden" answer is [unknown].

**Respond** `POST /api/v1/vendor/tickets/<ticket_id>/response` with
`{"message": "..."}` → `201 {"success": true, "ticket_id": 2001, "response":
{"id", "message", "added_on", "vendor_display": true, "added_by": {"id",
"name"}}}` [doc].

- **Replying to a closed ticket reopens it** [doc]. Read the ticket first unless reopening is what you want.
- A retried reply probably posts twice, since nothing makes it idempotent [inferred]. A length limit is [unknown].

### Return, exchange, redirect

**Return** `POST /api/v2/vendor/order/return` `{"pk": 1001, "comment": "Customer refused"}` [doc]:
- sets the order's `vendor_return` flag to `true`;
- with a comment, creates an external comment with status "Pending";
- only the vendor who owns the order may do it.

Record every return you request this way: the same `vendor_return` flag is what
a post-delivery check reads to detect a return NCM started. The order detail
sends that flag as a string (`"False"` [observed 2026-11-16]); parse it as in
[Order detail](#order-detail).

**Exchange** `POST /api/v2/vendor/order/exchange-create` `{"pk": 1001}` [doc]: creates two orders, `cust_order` (a new delivery to the customer) and `ven_order` (the old item back to the vendor).

<a id="redirect"></a>**Redirect** `POST /api/v2/vendor/order/redirect` [doc]:

| Field | Required | Meaning |
|---|---|---|
| `pk` | yes | NCM order id |
| `name`, `phone`, `address` | yes | the new customer |
| `vendorOrderid` | no | your reference |
| `destination` | no | new destination **branch id** (an integer, unlike create, which takes branch names) [doc]. No documented endpoint returns branch ids: #18 gives names, and labels (#25) give a name and a `code` such as `TINK1` [doc]. The branch list (#1) carries an integer `pk` per branch [observed 2026-11-16], and one integration reads branch ids there [observed]; whether `destination` takes that `pk` is [unknown]. |
| `cod_charge` | no | new COD amount (decimal) |

The response carries the new `cod_charge` and `delivery_charge` as strings, and `changelogs` as free text. A changed branch adds an `RDRT-DiFF-BRNCH` charge; the same branch adds a `REDIRECT` charge. A phone NCM doesn't know creates a customer record [doc]. Which orders may be redirected is [unknown] in the doc. [observed] One integration reads an undocumented `GET /api/v2/vendor/order/redirectable` list.

### Webhook registration and test

**Register** `POST /api/v2/vendor/webhook` [doc]:

```json
{"webhook_url": "https://shop.example/webhooks/ncm/acct_1?token=<SECRET>"}
```

- `201 {"success": true, "message": "Webhook URLs created successfully!"}` the first time, `200 {"success": true, "message": "Webhook URLs updated successfully!"}` after that.
- `{"webhook_url": ""}` removes the stored URL.
- A URL that doesn't start with `http://` or `https://` gets a `400` with `success: false`.
- It sets the vendor portal's "Order Delivery Webhook URL", which receives every status event: the webhook doc follows the portal steps for that field with "You can also set or remove the URL through the API with POST /api/v2/vendor/webhook" [doc].
- [unknown] The doc says the endpoint manages "webhook URLs" for "order status and comment events", but its only parameter is `webhook_url`, described as the order status URL. How to set a comment webhook URL through the API, and what a comment event looks like, aren't documented.
- [unknown] No endpoint reads the stored URL back, and whether a change takes effect at once isn't said.

**Test** `POST /api/v2/vendor/webhook/test` with `{"webhook_url": "<url>"}` [doc]. NCM posts this test payload to that URL and reports what happened:

```json
{"event": "order.status.changed", "order_id": "TEST-123456", "status": "In Transit", "timestamp": "2026-01-02T12:00:00+05:45", "test": true}
```

| What happened | NCM's answer (HTTP 200 in every documented case) |
|---|---|
| your server answered 2xx | `{"success": true, "status_code": 200, "response": "OK"}` |
| your server answered an error | `{"success": true, "status_code": 400, "response": "Bad Request", "headers": {"Content-Type": "text/plain"}}` |
| no answer within 10 seconds | `{"success": false, "error": "Request timed out. The webhook URL did not respond within 10 seconds."}` |
| no connection | `{"success": false, "error": "Connection error. Could not connect to the webhook URL. Details: ..."}` |

**`success: true` only means NCM got an HTTP answer.** The test passed only if
`status_code` is 2xx.

- Pass the full URL, secret included. The test reaches your receiver like a real event; authenticate it and record it as a test (see [webhooks-and-statuses.md](webhooks-and-statuses.md#payloads-doc)).
- [unknown] whether the test carries the same headers as real webhooks (`User-Agent: NCM-Webhook/1.0`), whether the URL must be the registered one (the doc lets you pass any URL), and the endpoint's own errors, such as a missing token or `webhook_url`.

### Customers and rating stats

These endpoints return personal data. Call them only for a purpose the business
has agreed, and never log names, phones, emails or addresses.

- **List** `GET /api/v2/vendor/customers` [doc]: customers "either created by you or who have received at least one of your orders". Filters `name` (contains) and `phone` (starts with); `page` default 1, `page_size` default 25, maximum 100. Results are `{"id", "name", "phone", "address"}`; `address` may be `""`. The live list matched this shape [observed 2026-11-16]. What happens above 100 per page is [unknown].
- **Detail** `GET /api/v2/vendor/customers/<customer_id>/detail` [doc]: `{"id", "name", "phone", "email", "orders": [...]}`, each order `{"orderid", "created_date", "cod_charge", "delivery_charge", "last_delivery_status"}`. A 404 carries either `"Customer not found"` or `"Not found"`.
  - [unknown] The doc calls `orders` the "complete order history". Whether it holds only your account's orders, or the customer's orders with other vendors too, isn't said. Don't show it to staff or vendors until you know.
- **Rating stats** `GET /api/v2/vendor/ratings?phone=<phone>` [doc]: `{"phone", "total_orders", "total_delivered", "total_returned"}` "across the entire NCM system". `400` without `phone`. A `404 {"detail": "No customer found with this phone number"}` means no history, not a failure.
  - It describes a customer's orders with other vendors. Check with the business, and with NCM's terms, before using it to refuse or flag customers.
  - Accepted phone formats are [unknown]; one integration sends 10 digits [observed].

### Label data

`GET /api/v2/vendor/order/label/1001` returns what a delivery label needs, for one of your own orders [doc]:

```json
{
  "orderid": 1001,
  "delivery_type": "Home",
  "cod_charge": "1500.00",
  "from_branch": {"name": "<ORIGIN_BRANCH_NAME>", "code": "<BRANCH_CODE>", "district": "<DISTRICT>"},
  "to_branch": {"name": "<DESTINATION_BRANCH_NAME>", "code": "<BRANCH_CODE>", "district": "<DISTRICT>"},
  "from": {"name": "Example Vendor", "phone": "98XXXXXXXX", "phone2": ""},
  "receiver": {"name": "Test Customer", "phone": "98XXXXXXXX", "phone2": "", "address": "Example Tole, Ward 1"},
  "description": {"description": "1 x Example item", "delivery_instruction": "Call before delivery", "handling": "Non-Fragile", "vendor_orderid": "SHOP-ORDER-0001"}
}
```

`POST /api/v2/vendor/order/label/` with `{"ids": [1001, 1002, 9999]}` → [doc]

```json
{"labels": [{"orderid": 1002, "delivery_type": "Office", "cod_charge": "2200.00"}, {"orderid": 1001, "delivery_type": "Home", "cod_charge": "1500.00"}], "not_found": [9999]}
```

(Labels shortened here; each is the full object above.)

- [observed 2026-11-16] One production label had exactly the documented keys, but its `cod_charge` was a JSON **number**, not a decimal string like the order detail's. Parse both forms to the same decimal, without passing through a float (see Money in [Basics](#basics)). Its `delivery_type` was `Home`, and its `phone2` fields were `""`.
- `delivery_type` is `Office` for D2B and B2B orders and `Home` for the rest ([Delivery types](#delivery-types)).
- `from` holds the vendor for vendor orders, or the sending customer otherwise. Which orders aren't vendor orders is [unknown].
- `description` fields are `null` when the order has no description. Whether the whole `description` object can be `null` is [unknown]; handle both. [observed 2026-11-16] A bulk label came back with the `description` object present, its `description`, `delivery_instruction` and `vendor_orderid` all `null`, and `handling` still set.
- `handling` is `Fragile`, `Fragile and Valuable`, `Valuable` or `Non-Fragile`.
- `labels` can come back in any order: match on `orderid`. Ids that don't exist **and ids that belong to another vendor** both land in `not_found`, indistinguishably [doc].
- NCM recommends 100 ids or fewer per request; no hard limit is stated [doc].
- Keep the trailing slash on the POST path as documented.
- [inferred] `description.description`, `delivery_instruction` and `vendor_orderid` echo create's `package`, `instruction` and `vref_id`.
- [unknown] what a barcode or QR code on the label should encode, whether NCM offers a printable file, and whether label reads count against the 20,000 daily reads.

## Undocumented endpoints seen in production

[observed] One production integration calls this. It is not in the documents. Treat it as unstable, and confirm with NCM before use.

| Path | What the integration uses it for | Response shape it assumes |
|---|---|---|
| `GET /api/v2/vendor/order/redirectable` | which of the account's orders may be redirected now | paginated `{count, next, previous, results: [{orderid, branch, last_delivery_status}]}`, following `next` |

[observed 2026-11-16] The endpoint exists on production and returns that shape:
`200 {"count": <int>, "next": <string>, "previous": null, "results": [...]}`,
10 items to a page by default, each `{"orderid": <int>, "branch": <string>,
"last_delivery_status": <string>}`. Every parcel on the first page read
`Returned to Warehouse`, a status the documents never name (see
[webhooks-and-statuses.md](webhooks-and-statuses.md#status-vocabulary)). That
redirectable parcels are the ones back at NCM's warehouse is [inferred] from one
page. It is still undocumented: NCM can change or remove it.

Two endpoints that integration called without documentation are now in the API
doc: rating stats (#24), whose documented shape matches what it assumed, and
ticket detail (#20), where it parsed a status loosely from `status`,
`ticket_status` or similar, and the doc puts a boolean at `ticket.status`.

The same integration retries an order-detail read when the error text matches "expected available in N seconds", which is Django REST framework's throttling wording [observed]. Whether NCM sends it, and with which HTTP status, is [unknown]. Production responses carry an `Allow` header, which Django REST framework's views send [observed 2026-11-16], so DRF's throttling answer (`429` with that wording and a `Retry-After` header) is plausible [inferred]. Handle a `429` and that text both.

## What to ask NCM before go-live

The open questions, with their status and NCM's answers as they arrive, are
tracked in [open-questions.md](open-questions.md). Ask them before go-live.
