# NCM API contract

Nepal Can Move (NCM) is a courier in Nepal. This file is the public API contract
as NCM's own documents state it, plus a short, clearly marked list of behaviour
seen in one production integration but not in those documents.

**Sources**

- *NCM API Documentation* v2 (PDF, file name `NCM_API_DOC_V2`, 32 pages, undated; received 2026-11-11). Called **API doc** below. It replaces the earlier 18-page PDF dated `251222`: it keeps that PDF's endpoints and adds the webhook-registration, webhook-test, assigned-branch, ticket-detail, ticket-response, customer, rating and label endpoints. Where the two differ, this file follows v2 and says what changed.
- *NCM Webhook Integration Documentation*, version 1.1, "Last updated: September 2026", status "Beta (subject to changes)". Called **Webhook doc**. Its contract is in [webhooks-and-statuses.md](webhooks-and-statuses.md).

Nothing in this file has been checked against the live or demo API yet. On 2026-11-11 the demo token NCM issued answered `401 {"detail": "Invalid token."}` on every call, so the first demo test is still to come.

**Labels used**

- **[doc]** stated by NCM's documents. Example values below are adapted from the documents' examples, with ids, names and dates changed.
- **[inferred]** follows from the documents without being stated in them.
- **[observed]** seen in one production integration's code, not in NCM's documents. Code shows what the integration *handles*, not what NCM *sends*; confirm with NCM before you depend on it.
- **[reported]** that integration's team reports it from production checks; not visible in its code.
- **[unknown]** neither source settles it. Don't fill the gap with a guess.

## Basics

| Topic | Contract |
|---|---|
| Host | Every example uses `https://demo.nepalcanmove.com` [doc]. The production host is **not in the documents** [unknown]. Ask NCM, and make the base URL configuration, never a constant. |
| Auth | Header `Authorization: Token <api-token>` [doc]. "Every vendor is provided with an API Token Key"; a new or forgotten token comes from NCM's IT admin [doc]. |
| Token scope | One token per vendor (merchant) account [doc]. The integration's code assumes order ids are per-account sequences and that one account's token can't read another's orders [observed]; in one production check the platform token answered for none of 168 ids created under shops' own tokens [reported]. NCM's documents say neither. |
| Content type | `Content-Type: application/json` on POST examples [doc]. |
| Daily limits | "Order Creation : 1,000 per day"; "Order View (Detail, Comments, Status ): 20,000 per day" [doc]. The `251222` PDF gave 200 and 5,000. Whether the limit is per token, when it resets, which of the newer reads (labels, customers, ratings, tickets) count as order views, and what the response is when exceeded: [unknown]. |
| Conduct | "Avoid duplication of order creation from both bulk file upload and api system." "No Spamming or running scripts to overload the server." [doc] |
| Versioning | Paths mix `/api/v1/` and `/api/v2/` [doc]. No deprecation policy is documented [unknown]. |
| Pagination | Documented for the staff list (`page_size` default 20) and the customer list (`page_size` default 25, maximum 100), both as `count`, `next`, `previous`, `results` [doc]. |
| Sandbox | The documents are written against the demo host. NCM gave the product owner a demo-portal login and a demo token on 2026-11-11 [reported]; whether every vendor gets one is [unknown]. Whether the demo shares data or tokens with production: [unknown]. |

## Errors

| Situation | Response |
|---|---|
| GET without a token | `401 {"detail": "Authentication credentials were not provided."}` |
| A token NCM doesn't know | `401 {"detail": "Invalid token."}`. Not in the documents; seen on the demo host on 2026-11-11, on every endpoint tried, the branch list included. |
| GET without `id` | `400 {"detail": "ID parameter missing"}` |
| GET with an unknown or invalid id | `404 {"detail": "Not found."}` |
| Server error | `500 {"detail": "Server Error"}` |
| Order create, bad fields | `400 {"Error": {"<field>": "<message>", ...}}` |
| Comment create, bad fields | `400 {"Error": {"Order Id": "...", "Comments": "..."}}` |
| Return, missing id | `400 {"message": "Order ID is required"}` |
| Return, unknown order | `404 {"message": "Order not found"}` |
| Webhook URL not `http://` or `https://` | `400 {"success": false, "message": "Please enter a valid URL for Order Status Webhook (must start with http:// or https://)"}` |
| Label, unknown order | `404 {"detail": "Order not found"}`. Only the account's own orders are accessible; that another vendor's order gets this same 404 is [inferred] from the batch, which says so |
| Label batch, empty or missing `ids` | `400 {"detail": "\"ids\" must be a non-empty array"}` |
| Customer detail, unknown customer | `404 {"detail": "Customer not found"}` or `404 {"detail": "Not found"}` |
| Rating, no `phone` | `400 {"detail": "phone parameter is required"}` |
| Rating, a phone NCM doesn't know | `404 {"detail": "No customer found with this phone number"}` |

Every row is [doc] except the `Invalid token.` row, which was seen, not documented.

Error bodies use four shapes: `detail`, `Error` (an object keyed by field), `message`, and `success: false` with `message`. Parse all four. The response to a rate limit (for example 429) is [unknown]. Expect HTML error pages from proxies as well, and never show a raw body to an end user.

## Endpoint catalog

Every endpoint takes `Authorization: Token <api-token>` unless the row says otherwise.

| # | Purpose | Method and path | Request | Success response [doc] |
|---|---|---|---|---|
| 1 | Branch list with details (phone, covered areas, district, region) | `GET /api/v2/branches` | none | Shape **not documented**, in v2 too [unknown]. The doc shows no auth header for this one; one integration sends none and gets branches [observed]. With a token NCM rejects, it answered 401 like every other endpoint tried (demo, 2026-11-11). Branch **ids**, which the redirect endpoint needs, are documented nowhere else; that integration reads a `pk` field here [observed]. Branch **codes** (such as `TINK1`) appear in label data (#25) [doc]. Test with a demo token. |
| 2 | Delivery charge between branches | `GET /api/v1/shipping-rate?creation=<from>&destination=<to>&type=<type>` | query `creation` (pickup branch), `destination` (destination branch), `type` (below). The doc's example uses branch **names** in capitals (`creation=TINKUNE&destination=POKHARA`) [doc]; whether ids or codes are accepted is [unknown]. | Shape **not documented** [unknown] |
| 3 | One order's detail | `GET /api/v1/order?id=<ncm-order-id>` | query `id` | `{"orderid", "cod_charge", "delivery_charge", "last_delivery_status", "payment_status"}` |
| 4 | One order's comments, newest first | `GET /api/v1/order/comment?id=<ncm-order-id>` | query `id` | array of `{"orderid", "comments", "addedBy", "added_time"}` |
| 5 | Last 25 comments across the account's orders | `GET /api/v1/order/getbulkcomments` | none | same item shape as #4 |
| 6 | One order's status history, newest first | `GET /api/v1/order/status?id=<ncm-order-id>` | query `id` | array of `{"orderid", "status", "added_time"}` |
| 7 | Create an order | `POST /api/v1/order/create` | JSON, see [Create an order](#create-an-order) | `200 {"Message": "Order Successfully Created", "orderid": <int>}` |
| 8 | Add a comment to an order | `POST /api/v1/comment` | `{"orderid", "comments"}`, both required | `200 {"message": "Comment successfully created"}` |
| 9 | Current status of many orders | `POST /api/v1/orders/statuses` | `{"orders": [<int>, ...]}` | `200 {"result": {"<id>": "<status>"}, "errors": [<id>, ...]}` |
| 10 | General support ticket | `POST /api/v2/vendor/ticket/create/new` (the `251222` PDF gave `…/ticket/create`) | `{"ticket_type", "message", "branch"?}`; `message` max 500 chars; `branch` required when `ticket_type` is `Pickup`. See [Tickets](#tickets) | `201 {"message": "Ticket created", "ticket": <int>}` |
| 11 | COD transfer request ticket | `POST /api/v2/vendor/ticket/cod/create` | `{"bankName", "bankAccountName", "bankAccountNumber"}`, all required | `201 {"message": "COD ticket created", "ticket": <int>}` |
| 12 | Close own ticket | `POST /api/v2/vendor/ticket/close/<ticket_id>` | ticket id in the path (`pk`) | `200 {"message": "Ticket closed", "ticket": <int>}` |
| 13 | Active staff list | `GET /api/v2/vendor/staffs?q=&page=&page_size=` (`limit` is an alias of `page_size`) | all optional; `page` default 1, `page_size` default 20 | `{"count", "next", "previous", "results": [{"id", "name", "email", "phone"}]}` |
| 14 | Mark an order for return | `POST /api/v2/vendor/order/return` | `{"pk": <order id>, "comment"?}` | `200 {"message": "Order marked for return successfully", "order": <int>, "vendor_return": true}` |
| 15 | Exchange (replacement plus pickup of the old item) | `POST /api/v2/vendor/order/exchange-create` | `{"pk": <original order id>}` | `200 {"message": "Exchange orders created", "cust_order": <int>, "ven_order": <int>}` |
| 16 | Redirect to another address or customer | `POST /api/v2/vendor/order/redirect` | see [Redirect](#redirect) | `200 {"message", "order", "cod_charge", "delivery_charge", "changelogs"}` |
| 17 | Set or remove the order-status webhook URL | `POST /api/v2/vendor/webhook` | `{"webhook_url"}`, required; must start with `http://` or `https://`; an empty string removes the stored URL | `201 {"success": true, "message": "Webhook URLs created successfully!"}` the first time, then `200 {"success": true, "message": "Webhook URLs updated successfully!"}`. See [webhooks-and-statuses.md](webhooks-and-statuses.md#the-webhook-contract-doc) |
| 18 | Send a test event to a URL | `POST /api/v2/vendor/webhook/test` | `{"webhook_url"}`, required | Always `200`. `{"success": true, "status_code", "response"}` when your server answered (its own status, even 4xx, is in `status_code`, with `headers` on an error); `{"success": false, "error"}` on a timeout (10 s) or a connection error |
| 19 | The account's assigned pickup branches | `GET /api/v2/vendor/assigned-branches` | none | `200` array of branch names, such as `["KATHMANDU", "POKHARA"]`; `[]` when none is assigned |
| 20 | One ticket's detail | `GET /api/v1/tickets/<ticket_id>/detail` | ticket id in the path | `200 {"success": true, "ticket": {…}}`; see [Tickets](#tickets) |
| 21 | Reply to a ticket | `POST /api/v1/vendor/tickets/<ticket_id>/response` | `{"message"}` | `201 {"success": true, "ticket_id", "response": {"id", "message", "added_on", "vendor_display": true, "added_by": {"id", "name"}}}`. Reopens a closed ticket |
| 22 | Customers linked to the account | `GET /api/v2/vendor/customers?page=&page_size=&name=&phone=` | all optional; `page_size` default 25, maximum 100; `name` contains, `phone` starts with | `{"count", "next", "previous", "results": [{"id", "name", "phone", "address"}]}`. See [Customers and ratings](#customers-and-ratings) |
| 23 | One customer and their order history | `GET /api/v2/vendor/customers/<customer_id>/detail` | customer id in the path | `{"id", "name", "phone", "email", "orders": [{"orderid", "created_date", "cod_charge", "delivery_charge", "last_delivery_status"}]}` |
| 24 | A phone number's delivery record across all of NCM | `GET /api/v2/vendor/ratings?phone=<phone>` | query `phone`, required | `{"phone", "total_orders", "total_delivered", "total_returned"}`. See [Customers and ratings](#customers-and-ratings) |
| 25 | Label data for one order | `GET /api/v2/vendor/order/label/<order_id>` | order id in the path | see [Labels](#labels) |
| 26 | Label data for many orders | `POST /api/v2/vendor/order/label/` (trailing slash as documented) | `{"ids": [<int>, ...]}`, non-empty; "recommended ≤ 100" | `200 {"labels": [...], "not_found": [<id>, ...]}` |

Not offered by the documents: cancelling an order, creating an order on hold, a pickup-request endpoint other than a `Pickup` ticket, a COD remittance or settlement statement, idempotency keys, a webhook signature. Label **data** is offered (#25, #26); a printable label or AWB file is not.

### Delivery types

The rate endpoint and the create endpoint name the four services differently.
The rate table describes each `type` as Door2Door, Branch2Door, Door2Branch or
Branch2Branch, and the create endpoint uses those four words as its
`delivery_type` values. The doc never puts the two side by side, so the pairing
below is [inferred]; the names and charges in each row are [doc].

| Service | Rate `type` | Create `delivery_type` | Charge, as the rate table words it |
|---|---|---|---|
| NCM picks up from the sender and delivers to the door | `Pickup/Collect` | `Door2Door` (the default) | full base charge |
| Sender drops at a branch, NCM delivers to the door | `Send` | `Branch2Door` | full base charge |
| NCM picks up, customer collects at a branch | `D2B` | `Door2Branch` | base charge − 50 |
| Sender drops at a branch, customer collects at a branch | `B2B` | `Branch2Branch` | base charge − 50 |

"Base charge − 50" is the doc's wording; it gives no unit or base. Read the
charge from the rate endpoint; never compute it yourself. Keep one mapping table
in code, and don't send a rate `type` value to the create endpoint.

Label data (#25) names the service a third way: its `delivery_type` is
`"Office"` for D2B and B2B orders and `"Home"` for all others [doc]. It tells
you where the customer collects, not which of the four services was booked.

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

The example sends every value as a JSON string, numbers included [doc]. Not documented [unknown]: field length limits, accepted phone formats, whether `cod_charge` may be `"0"` for a prepaid order, whether `vref_id` must be unique or is checked for duplicates, how `fbranch` relates to the account's own pickup branch.

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

- Money is a decimal **string** [doc]. Parse it as a decimal, never as a float.
- `payment_status` values other than `"Completed"`, and what `"Completed"` means (cash collected from the customer, or paid out to the vendor), are **not documented** [unknown]. Don't read it as "the vendor has been paid".
- One integration's parser also reads `vendor_return` (boolean: the parcel went back to the vendor rather than to the customer), `delivered_date`, `active` and a tracking id (`trackid`), none of them documented [observed]. Its production data holds NCM's `vendor_return` answers for many parcels, so that field at least is real [reported]; its return handling depends on it. The return endpoint's documented response also names a `vendor_return` flag [doc]. The other three are unverified. Confirm with NCM.

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

`added_time` carries a `+05:45` offset (Nepal) in the examples [doc]. Sort by the parsed time rather than trusting array order.

`POST /api/v1/orders/statuses` with `{"orders": [1001, 1002, 1003, 1004, 1005]}` [doc]:

```json
{
  "result": {"1001": "Pickup Order Created", "1002": "Arrived", "1004": "Drop off Order Created", "1005": "Delivered"},
  "errors": [1003]
}
```

- Ids go in as integers and come back as **string keys** [doc].
- `errors` lists ids NCM could not answer for. What causes an error entry is [unknown].
  - [observed] One integration found most of its long-stuck parcels listed here, while control parcels on the same token answered normally.
  - [reported] Ids created under another account's token went unanswered in one production check, so group ids by the token that created them.
- Maximum batch size: [unknown]. One integration uses 100.
- Whether a bulk call counts as one read or one per id against the 20,000 daily order views: [unknown].

### Comments

`GET /api/v1/order/comment?id=1001` → newest first [doc]:

```json
[{"orderid": 1001, "comments": "Customer not reachable", "addedBy": "NCM Staff", "added_time": "2026-01-02T16:43:15.687200+05:45"}]
```

`addedBy` values seen in the doc: `"NCM Staff"`, `"Vendor"`. Comment ids are **not** in the documented response [doc]; one integration's code notes that the comment list "has not always included comment_id" and reads it when present [observed].

De-duplicate on (account, NCM order id, `comment_id`) when present, else on
(account, NCM order id, text, `addedBy`, `added_time`). Your own comments come
back with `addedBy: "Vendor"`; match them to the local comment by text within a
few minutes rather than storing them twice.

`GET /api/v1/order/getbulkcomments` returns the last 25 comments across the account's orders, "latest comments ... at the top" [doc]. The doc's own example is not strictly newest first, so sort locally. With only 25 rows, a busy account can lose comments between polls; use it as a supplement, not the only feed.

`POST /api/v1/comment` with `{"orderid": "1001", "comments": "Please call before 5pm"}` → `200 {"message": "Comment successfully created"}` [doc]. No comment id comes back [doc]. A length limit is [unknown].

**A comment post isn't idempotent.** After a timeout or a 5xx, NCM may already
have stored the comment. Before posting again, read the thread
(`GET /api/v1/order/comment?id=`) and look for the same text from `Vendor`.

### Tickets

- Create with `POST /api/v2/vendor/ticket/create/new` [doc]. The `251222` PDF gave `/api/v2/vendor/ticket/create`; whether the old path still works is [unknown].
- `ticket_type` is one of `General` (general inquiries or issues), `Order Processing`, `Return` (return or refund requests) or `Pickup` (pickup scheduling or issues) [doc].
- `message` is at most 500 characters [doc].
- `branch` is required for a `Pickup` ticket and "must be one of the vendor's assigned pickup branches" [doc]: read them from `GET /api/v2/vendor/assigned-branches` (#19). The doc's example writes the branch in title case (`"Tinkune"`) while the assigned-branch list is in capitals; whether the match ignores case is [unknown].
- A `Pickup` ticket is how you ask NCM to collect parcels. The doc's example message gives a phone, the number of packets and the address: `"98XXXXXXXX, No. of Packets: 5, Address: Example Tole"` [doc]. There is no dedicated pickup endpoint [doc].
- A COD transfer ticket carries bank details: treat them as sensitive data, never log them, and confirm with the business who may file one.
- **Detail** `GET /api/v1/tickets/<ticket_id>/detail` [doc]. A vendor sees only its own tickets. The response:

  ```json
  {
    "success": true,
    "ticket": {
      "id": 2001, "ticket_type": "Pickup",
      "message": "98XXXXXXXX<br>No. of Packets: 3<br>Address: Example Tole",
      "added_on": "2026-04-09T11:28:00+05:45",
      "status": false, "comment": "", "attachment": null,
      "branch": "BUTWAL", "closed_on": null,
      "vendor": {"id": 501, "name": "Example Vendor", "location": "<lat>,<lng>"},
      "assigned_to": {"id": 43, "name": "Example Logistics"},
      "closed_by": {"id": null, "name": null}
    },
    "responses": [
      {"id": 901, "message": "Will pick up tomorrow morning.", "added_on": "2026-04-09T12:10:00+05:45", "vendor_display": true, "added_by": {"id": 501, "name": "Example Vendor"}}
    ]
  }
  ```

  - In the doc's example, `message` comes back with `<br>` between the parts of the vendor's message and with text NCM appended ("Actual Pickup count : 52"). That NCM always does this is [inferred]. Render it as text, never as HTML.
  - What `status: false` means (open, or not resolved) is [unknown]. In the doc's one example, `closed_on` and `closed_by` are null; that they stay null until NCM closes the ticket, and so tell you it closed, is [inferred].
  - `responses` is a top-level field beside `ticket`, not inside it [doc].
- **Reply** `POST /api/v1/vendor/tickets/<ticket_id>/response` with `{"message"}` [doc]. It stores the reply with `vendor_display: true`, **reopens the ticket if it was closed**, and answers `201` with the stored reply. A length limit is [unknown]. Like a comment, a reply isn't idempotent: after a timeout, read the detail before posting again.

### Return, exchange, redirect

**Return** `POST /api/v2/vendor/order/return` `{"pk": 1001, "comment": "Customer refused"}` [doc]:
- sets the order's `vendor_return` flag to `true`;
- with a comment, creates an external comment with status "Pending";
- only the vendor who owns the order may do it.

Record every return you request this way: the same `vendor_return` flag is what
a post-delivery check reads to detect a return NCM started.

**Exchange** `POST /api/v2/vendor/order/exchange-create` `{"pk": 1001}` [doc]: creates two orders, `cust_order` (a new delivery to the customer) and `ven_order` (the old item back to the vendor).

<a id="redirect"></a>**Redirect** `POST /api/v2/vendor/order/redirect` [doc]:

| Field | Required | Meaning |
|---|---|---|
| `pk` | yes | NCM order id |
| `name`, `phone`, `address` | yes | the new customer |
| `vendorOrderid` | no | your reference |
| `destination` | no | new destination **branch id** (an integer, unlike create, which takes branch names) [doc]. The only documented source of branch ids is this field's description; see endpoint #1 for where one integration gets them. |
| `cod_charge` | no | new COD amount (decimal) |

The response carries the new `cod_charge` and `delivery_charge` as strings, and `changelogs` as free text. A changed branch adds an `RDRT-DiFF-BRNCH` charge; the same branch adds a `REDIRECT` charge. A phone NCM doesn't know creates a customer record [doc]. Which orders may be redirected is [unknown] in the doc. [observed] One integration reads an undocumented `GET /api/v2/vendor/order/redirectable` list.

<a id="labels"></a>
## Labels

`GET /api/v2/vendor/order/label/<order_id>` returns what a delivery label
needs for one of the account's own orders [doc]:

```json
{
  "orderid": 1001,
  "delivery_type": "Home",
  "cod_charge": "1500.00",
  "from_branch": {"name": "TINKUNE", "code": "TINK1", "district": "Kathmandu"},
  "to_branch": {"name": "BIRATNAGAR", "code": "BIRA1", "district": "Morang"},
  "from": {"name": "Example Vendor", "phone": "98XXXXXXXX", "phone2": ""},
  "receiver": {"name": "Test Customer", "phone": "98XXXXXXXX", "phone2": "", "address": "Example Tole, Ward 1"},
  "description": {"description": "1 x Example item", "delivery_instruction": "Call before delivery", "handling": "Non-Fragile", "vendor_orderid": "SHOP-ORDER-0001"}
}
```

`POST /api/v2/vendor/order/label/` with `{"ids": [1001, 1002, 9999]}` returns
`{"labels": [<the same shape>, ...], "not_found": [9999]}` [doc].

- `delivery_type` is `"Office"` for D2B and B2B orders, `"Home"` otherwise ([Delivery types](#delivery-types)).
- `from` is the vendor for vendor-type orders, otherwise the sending customer.
- `description`'s fields are null when no description was added; `handling` is `"Fragile"`, `"Fragile and Valuable"`, `"Valuable"` or `"Non-Fragile"`. Create (#7) takes no handling field, so where it comes from is [unknown].
- An id that belongs to another vendor lands in `not_found`, exactly like a wrong id. The batch keeps no order: match by `orderid`. Keep batches at 100 ids or fewer.
- Label data is customer personal data (name, phone, address). Fetch it when a label is printed, don't store or log it, and print it only for the shop that owns the order.
- Branch `code` appears only here. Create, the rate endpoint and tickets take branch **names**, and redirect takes a branch **id** [doc].

<a id="customers-and-ratings"></a>
## Customers and ratings

NCM keeps its own customer records. Three endpoints read them [doc]:

- **List** `GET /api/v2/vendor/customers`: customers the account created or delivered at least one order to, filterable by `name` (contains) and `phone` (starts with).
- **Detail** `GET /api/v2/vendor/customers/<customer_id>/detail`: "full profile and complete order history for a specific customer of your vendor account" [doc]: name, phone, email and orders, each with its `cod_charge`, `delivery_charge` and `last_delivery_status` (one example reads `"Sent to Vendor"`). Whether the history holds only this account's orders or the customer's orders with every vendor is [unknown]; until NCM answers, treat it like the rating below.
- **Rating** `GET /api/v2/vendor/ratings?phone=<phone>`: "delivery performance stats for a customer by phone number — total orders placed, successful deliveries, and returns across the entire NCM system" [doc], for example `{"phone": "98XXXXXXXX", "total_orders": 18, "total_delivered": 15, "total_returned": 3}`. A phone NCM doesn't know answers `404`.

The rating is personal data about a customer's dealings with **other** vendors.
Sending a customer's phone to NCM to look it up, and acting on the answer (to
refuse or hold an order), are decisions for the business and its privacy
rules, not for the integration. Settle them before building on it, never log
the phone, and don't store the counts beyond the decision they serve. The
phone format the endpoint expects is [unknown]; the doc's example uses ten
digits with no country code.

## Undocumented endpoints seen in production

[observed] One production integration calls this. It is not in the documents. Treat it as unstable, and confirm with NCM before use. (That integration also called the ticket-detail and rating endpoints before v2 documented them, as #20 and #24.)

| Path | What the integration uses it for | Response shape it assumes |
|---|---|---|
| `GET /api/v2/vendor/order/redirectable` | which of the account's orders may be redirected now | paginated `{count, next, previous, results: [{orderid, branch, last_delivery_status}]}`, following `next` |

The same integration retries an order-detail read when the error text matches "expected available in N seconds", which is Django REST framework's throttling wording [observed]. Whether NCM sends it, and with which HTTP status, is [unknown].

## What to ask NCM before go-live

1. The production base URL, and whether demo tokens and data are separate from production. (Still missing from v2.)
2. Rate-limit scope (per token?), reset time, the response when it's exceeded, and which of the newer reads (labels, customers, ratings, tickets) count against the 20,000 order views.
3. Response shapes for `/api/v2/branches` and `/api/v1/shipping-rate`.
4. How to cancel an order, or hold one, after create. Neither is documented.
5. Maximum batch size for `/api/v1/orders/statuses`, and why an id lands in `errors`.
6. What `payment_status` values exist, and how COD remittance to the vendor is reported.
7. Whether `vref_id` is checked for duplicates.
8. How a receiver can tell that a webhook came from NCM: a signature, a fixed source address, or only a secret in the URL. v2 documents registration (#17) and a test (#18), but no signature.
9. The full list of order statuses and webhook events, including `comment_added`, `returned_to_warehouse`, and the maximum ids in one bulk event. Whether `POST /api/v2/vendor/webhook` can also set the "Order Comment Webhook URL" the portal shows.
10. Whether undocumented fields (`vendor_return`, `delivered_date`, `active`, a tracking id) and the `/order/redirectable` endpoint are supported for vendors.
11. Whether a parcel can still be collected after you decide to cancel it, and how to stop that.
12. Whether webhooks for one parcel arrive in order.
13. Which characters names and addresses may contain (Devanagari?), and the length limits per field.
14. Whether a bulk status call counts once or per id against the daily reads.
15. How to rotate a webhook secret without losing events.
16. Whether `cod_charge: "0"` is accepted for a prepaid order, and what the rider then collects.
17. Where branch ids come from, since the branch list's shape is undocumented and the redirect's `destination` needs one; and whether create and the rate endpoint accept the branch `code` that label data shows.
18. Whether `Delivery Attempted`, `Out for Delivery` and `Dispatched to <BRANCH>` are real status strings, and what `returned_to_warehouse` means.
19. Whether posting a comment is idempotent in any way, since no comment id is returned.
20. Whether NCM's terms let a vendor use the rating endpoint to screen customers, and what NCM tells the customer about it. Whether customer detail's order history covers only this account's orders.
21. Whether the old ticket path `/api/v2/vendor/ticket/create` still works, and whether a `Pickup` ticket's `branch` match ignores case.
22. What a ticket's `status` field means, and where `handling` (label data) is set, since create takes no such field.
