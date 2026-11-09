# NCM API contract

Nepal Can Move (NCM) is a courier in Nepal. This file is the public API contract
as NCM's own documents state it, plus a short, clearly marked list of behaviour
seen in one production integration but not in those documents.

**Sources**

- _NCM API Documentation_ (PDF, file name dated `251222`, 18 pages). Called **API doc** below.
- _NCM Webhook Integration Documentation_, version 1.1, "Last updated: September 2026", status "Beta (subject to changes)". Called **Webhook doc**. Its contract is in [webhooks-and-statuses.md](webhooks-and-statuses.md).

**Labels used**

- **[doc]** stated by NCM's documents. Example values below are adapted from the documents' examples, with ids, names and dates changed.
- **[inferred]** follows from the documents without being stated in them.
- **[observed]** seen in one production integration's code, not in NCM's documents. Code shows what the integration _handles_, not what NCM _sends_; confirm with NCM before you depend on it.
- **[reported]** that integration's team reports it from production checks; not visible in its code.
- **[unknown]** neither source settles it. Don't fill the gap with a guess.

## Basics

| Topic        | Contract                                                                                                                                                                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host         | Every example uses `https://demo.nepalcanmove.com` [doc]. The production host is **not in the documents** [unknown]. Ask NCM, and make the base URL configuration, never a constant.                                                                                                                                                    |
| Auth         | Header `Authorization: Token <api-token>` [doc]. "Every vendor is provided with an API Token Key"; a new or forgotten token comes from NCM's IT admin [doc].                                                                                                                                                                            |
| Token scope  | One token per vendor (merchant) account [doc]. The integration's code assumes order ids are per-account sequences and that one account's token can't read another's orders [observed]; in one production check the platform token answered for none of 168 ids created under shops' own tokens [reported]. NCM's documents say neither. |
| Content type | `Content-Type: application/json` on POST examples [doc].                                                                                                                                                                                                                                                                                |
| Daily limits | "Order Creation : 200 per day"; "Order View (Detail, Comments, Status): 5000 per day" [doc]. Whether the limit is per token, when it resets, and what the response is when exceeded: [unknown].                                                                                                                                         |
| Conduct      | "Avoid duplication of order creation from both bulk file upload and api system." "No Spamming or running scripts to overload the server." [doc]                                                                                                                                                                                         |
| Versioning   | Paths mix `/api/v1/` and `/api/v2/` [doc]. No deprecation policy is documented [unknown].                                                                                                                                                                                                                                               |
| Pagination   | Documented only for the staff list (`count`, `next`, `previous`, `results`) [doc].                                                                                                                                                                                                                                                      |
| Sandbox      | The documents are written against the demo host. Whether the demo shares data or tokens with production: [unknown].                                                                                                                                                                                                                     |

## Errors

| Situation                         | Response [doc]                                                    |
| --------------------------------- | ----------------------------------------------------------------- |
| GET without a token               | `401 {"detail": "Authentication credentials were not provided."}` |
| GET without `id`                  | `400 {"detail": "ID parameter missing"}`                          |
| GET with an unknown or invalid id | `404 {"detail": "Not found."}`                                    |
| Server error                      | `500 {"detail": "Server Error"}`                                  |
| Order create, bad fields          | `400 {"Error": {"<field>": "<message>", ...}}`                    |
| Comment create, bad fields        | `400 {"Error": {"Order Id": "...", "Comments": "..."}}`           |
| Return, missing id                | `400 {"message": "Order ID is required"}`                         |
| Return, unknown order             | `404 {"message": "Order not found"}`                              |

Error bodies use three shapes: `detail`, `Error` (an object keyed by field) and `message`. Parse all three. The response to a rate limit (for example 429) is [unknown]. Expect HTML error pages from proxies as well, and never show a raw body to an end user.

## Endpoint catalog

Every endpoint takes `Authorization: Token <api-token>` unless the row says otherwise.

| #   | Purpose                                                           | Method and path                                                                      | Request                                                                                                                                                                                                                                   | Success response [doc]                                                                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Branch list with details (phone, covered areas, district, region) | `GET /api/v2/branches`                                                               | none                                                                                                                                                                                                                                      | Shape **not documented** [unknown]. The doc shows no auth header for this one; one integration sends none and gets branches [observed]. Branch **ids**, which the redirect endpoint needs, are documented nowhere else; that integration reads a `pk` field here [observed]. Test with a demo token. |
| 2   | Delivery charge between branches                                  | `GET /api/v1/shipping-rate?creation=<from>&destination=<to>&type=<type>`             | query `creation` (pickup branch), `destination` (destination branch), `type` (below). The doc's example uses branch **names** in capitals (`creation=TINKUNE&destination=POKHARA`) [doc]; whether ids or codes are accepted is [unknown]. | Shape **not documented** [unknown]                                                                                                                                                                                                                                                                   |
| 3   | One order's detail                                                | `GET /api/v1/order?id=<ncm-order-id>`                                                | query `id`                                                                                                                                                                                                                                | `{"orderid", "cod_charge", "delivery_charge", "last_delivery_status", "payment_status"}`                                                                                                                                                                                                             |
| 4   | One order's comments, newest first                                | `GET /api/v1/order/comment?id=<ncm-order-id>`                                        | query `id`                                                                                                                                                                                                                                | array of `{"orderid", "comments", "addedBy", "added_time"}`                                                                                                                                                                                                                                          |
| 5   | Last 25 comments across the account's orders                      | `GET /api/v1/order/getbulkcomments`                                                  | none                                                                                                                                                                                                                                      | same item shape as #4                                                                                                                                                                                                                                                                                |
| 6   | One order's status history, newest first                          | `GET /api/v1/order/status?id=<ncm-order-id>`                                         | query `id`                                                                                                                                                                                                                                | array of `{"orderid", "status", "added_time"}`                                                                                                                                                                                                                                                       |
| 7   | Create an order                                                   | `POST /api/v1/order/create`                                                          | JSON, see [Create an order](#create-an-order)                                                                                                                                                                                             | `200 {"Message": "Order Successfully Created", "orderid": <int>}`                                                                                                                                                                                                                                    |
| 8   | Add a comment to an order                                         | `POST /api/v1/comment`                                                               | `{"orderid", "comments"}`, both required                                                                                                                                                                                                  | `200 {"message": "Comment successfully created"}`                                                                                                                                                                                                                                                    |
| 9   | Current status of many orders                                     | `POST /api/v1/orders/statuses`                                                       | `{"orders": [<int>, ...]}`                                                                                                                                                                                                                | `200 {"result": {"<id>": "<status>"}, "errors": [<id>, ...]}`                                                                                                                                                                                                                                        |
| 10  | General support ticket                                            | `POST /api/v2/vendor/ticket/create`                                                  | `{"ticket_type", "message"}`; `message` max 500 chars                                                                                                                                                                                     | `201 {"message": "Ticket created", "ticket": <int>}`                                                                                                                                                                                                                                                 |
| 11  | COD transfer request ticket                                       | `POST /api/v2/vendor/ticket/cod/create`                                              | `{"bankName", "bankAccountName", "bankAccountNumber"}`, all required                                                                                                                                                                      | `201 {"message": "COD ticket created", "ticket": <int>}`                                                                                                                                                                                                                                             |
| 12  | Close own ticket                                                  | `POST /api/v2/vendor/ticket/close/<ticket_id>`                                       | ticket id in the path (`pk`)                                                                                                                                                                                                              | `200 {"message": "Ticket closed", "ticket": <int>}`                                                                                                                                                                                                                                                  |
| 13  | Active staff list                                                 | `GET /api/v2/vendor/staffs?q=&page=&page_size=` (`limit` is an alias of `page_size`) | all optional; `page` default 1, `page_size` default 20                                                                                                                                                                                    | `{"count", "next", "previous", "results": [{"id", "name", "email", "phone"}]}`                                                                                                                                                                                                                       |
| 14  | Mark an order for return                                          | `POST /api/v2/vendor/order/return`                                                   | `{"pk": <order id>, "comment"?}`                                                                                                                                                                                                          | `200 {"message": "Order marked for return successfully", "order": <int>, "vendor_return": true}`                                                                                                                                                                                                     |
| 15  | Exchange (replacement plus pickup of the old item)                | `POST /api/v2/vendor/order/exchange-create`                                          | `{"pk": <original order id>}`                                                                                                                                                                                                             | `200 {"message": "Exchange orders created", "cust_order": <int>, "ven_order": <int>}`                                                                                                                                                                                                                |
| 16  | Redirect to another address or customer                           | `POST /api/v2/vendor/order/redirect`                                                 | see [Redirect](#redirect)                                                                                                                                                                                                                 | `200 {"message", "order", "cod_charge", "delivery_charge", "changelogs"}`                                                                                                                                                                                                                            |
| 17  | Set or remove the webhook URL                                     | `POST /api/v2/vendor/webhook`                                                        | **not documented**: the webhook doc names it and says "see the NCM API documentation", but the API doc doesn't list it [unknown]                                                                                                          | [unknown]                                                                                                                                                                                                                                                                                            |

Not offered by the documents: cancelling an order, creating an order on hold, labels or AWB printing, a pickup-request endpoint, a COD remittance or settlement statement, idempotency keys.

### Delivery types

The rate endpoint and the create endpoint name the four services differently.
The rate table describes each `type` as Door2Door, Branch2Door, Door2Branch or
Branch2Branch, and the create endpoint uses those four words as its
`delivery_type` values. The doc never puts the two side by side, so the pairing
below is [inferred]; the names and charges in each row are [doc].

| Service                                                 | Rate `type`      | Create `delivery_type`    | Charge, as the rate table words it |
| ------------------------------------------------------- | ---------------- | ------------------------- | ---------------------------------- |
| NCM picks up from the sender and delivers to the door   | `Pickup/Collect` | `Door2Door` (the default) | full base charge                   |
| Sender drops at a branch, NCM delivers to the door      | `Send`           | `Branch2Door`             | full base charge                   |
| NCM picks up, customer collects at a branch             | `D2B`            | `Door2Branch`             | base charge − 50                   |
| Sender drops at a branch, customer collects at a branch | `B2B`            | `Branch2Branch`           | base charge − 50                   |

"Base charge − 50" is the doc's wording; it gives no unit or base. Read the
charge from the rate endpoint; never compute it yourself. Keep one mapping table
in code, and don't send a rate `type` value to the create endpoint.

### Create an order

`POST /api/v1/order/create` [doc]

| Field           | Required | Meaning                                                                         |
| --------------- | -------- | ------------------------------------------------------------------------------- |
| `name`          | yes      | customer name                                                                   |
| `phone`         | yes      | customer phone                                                                  |
| `phone2`        | no       | secondary phone                                                                 |
| `cod_charge`    | yes      | "cod amount including delivery": the cash NCM collects from the customer        |
| `address`       | yes      | general address of the customer                                                 |
| `fbranch`       | yes      | **name** of the origin (from) branch                                            |
| `branch`        | yes      | **name** of the destination branch                                              |
| `package`       | no       | package name or type                                                            |
| `vref_id`       | no       | vendor reference id: your own order reference                                   |
| `instruction`   | no       | delivery instruction                                                            |
| `delivery_type` | no       | `Door2Door`, `Branch2Door`, `Branch2Branch`, `Door2Branch`; default `Door2Door` |
| `weight`        | no       | kg; default 1                                                                   |

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
  { "orderid": 1001, "status": "Delivered", "added_time": "2026-01-02T13:24:30.960365+05:45" },
  {
    "orderid": 1001,
    "status": "Sent for Delivery",
    "added_time": "2026-01-02T13:22:21.033595+05:45"
  },
  {
    "orderid": 1001,
    "status": "Pickup Complete",
    "added_time": "2026-01-02T13:17:25.326792+05:45"
  },
  {
    "orderid": 1001,
    "status": "Sent for Pickup",
    "added_time": "2026-01-02T13:15:24.313074+05:45"
  },
  {
    "orderid": 1001,
    "status": "Pickup Order Created",
    "added_time": "2025-12-30T11:32:18.149352+05:45"
  }
]
```

`added_time` carries a `+05:45` offset (Nepal) in the examples [doc]. Sort by the parsed time rather than trusting array order.

`POST /api/v1/orders/statuses` with `{"orders": [1001, 1002, 1003, 1004, 1005]}` [doc]:

```json
{
  "result": {
    "1001": "Pickup Order Created",
    "1002": "Arrived",
    "1004": "Drop off Order Created",
    "1005": "Delivered"
  },
  "errors": [1003]
}
```

- Ids go in as integers and come back as **string keys** [doc].
- `errors` lists ids NCM could not answer for. What causes an error entry is [unknown].
  - [observed] One integration found most of its long-stuck parcels listed here, while control parcels on the same token answered normally.
  - [reported] Ids created under another account's token went unanswered in one production check, so group ids by the token that created them.
- Maximum batch size: [unknown]. One integration uses 100.
- Whether a bulk call counts as one read or one per id against the 5,000 daily reads: [unknown].

### Comments

`GET /api/v1/order/comment?id=1001` → newest first [doc]:

```json
[
  {
    "orderid": 1001,
    "comments": "Customer not reachable",
    "addedBy": "NCM Staff",
    "added_time": "2026-01-02T16:43:15.687200+05:45"
  }
]
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

- `ticket_type` is one of `General`, `Order Processing`, `Return`, `Pickup` [doc].
- `message` is at most 500 characters [doc].
- A COD transfer ticket carries bank details: treat them as sensitive data, never log them, and confirm with the business who may file one.
- [observed] One integration also reads a ticket's detail with `GET /api/v1/tickets/<ticket_id>/detail`, which is not documented. Tickets closed on NCM's side are only seen that way.
- [observed] A "Pickup" ticket is how one integration asks NCM to collect parcels: a message giving the number of packets, the nearest branch, the address and a phone. There is no dedicated pickup endpoint [doc].

### Return, exchange, redirect

**Return** `POST /api/v2/vendor/order/return` `{"pk": 1001, "comment": "Customer refused"}` [doc]:

- sets the order's `vendor_return` flag to `true`;
- with a comment, creates an external comment with status "Pending";
- only the vendor who owns the order may do it.

Record every return you request this way: the same `vendor_return` flag is what
a post-delivery check reads to detect a return NCM started.

**Exchange** `POST /api/v2/vendor/order/exchange-create` `{"pk": 1001}` [doc]: creates two orders, `cust_order` (a new delivery to the customer) and `ven_order` (the old item back to the vendor).

<a id="redirect"></a>**Redirect** `POST /api/v2/vendor/order/redirect` [doc]:

| Field                      | Required | Meaning                                                                                                                                                                                                               |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pk`                       | yes      | NCM order id                                                                                                                                                                                                          |
| `name`, `phone`, `address` | yes      | the new customer                                                                                                                                                                                                      |
| `vendorOrderid`            | no       | your reference                                                                                                                                                                                                        |
| `destination`              | no       | new destination **branch id** (an integer, unlike create, which takes branch names) [doc]. The only documented source of branch ids is this field's description; see endpoint #1 for where one integration gets them. |
| `cod_charge`               | no       | new COD amount (decimal)                                                                                                                                                                                              |

The response carries the new `cod_charge` and `delivery_charge` as strings, and `changelogs` as free text. A changed branch adds an `RDRT-DiFF-BRNCH` charge; the same branch adds a `REDIRECT` charge. A phone NCM doesn't know creates a customer record [doc]. Which orders may be redirected is [unknown] in the doc. [observed] One integration reads an undocumented `GET /api/v2/vendor/order/redirectable` list.

## Undocumented endpoints seen in production

[observed] One production integration calls these. They are not in the documents. Treat them as unstable, and confirm with NCM before use.

| Path                                           | What the integration uses it for                                                          | Response shape it assumes                                                                                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v2/vendor/order/redirectable`        | which of the account's orders may be redirected now                                       | paginated `{count, next, previous, results: [{orderid, branch, last_delivery_status}]}`, following `next`                                                                                                                    |
| `GET /api/v2/vendor/ratings?phone=<10 digits>` | a phone number's delivery history across NCM, for fraud checks before confirming an order | `{phone, total_orders, total_delivered, total_returned}`; a 404 means no history. This is personal data about a customer's other purchases: check with the business and NCM whether you may use it, and never log the phone. |
| `GET /api/v1/tickets/<ticket_id>/detail`       | a ticket's status                                                                         | a status under `status`, `ticket_status` or similar; the parser is deliberately loose                                                                                                                                        |

The same integration retries an order-detail read when the error text matches "expected available in N seconds", which is Django REST framework's throttling wording [observed]. Whether NCM sends it, and with which HTTP status, is [unknown].

## What to ask NCM before go-live

1. The production base URL, and whether demo tokens and data are separate from production.
2. Rate-limit scope (per token?), reset time, and the response when it's exceeded.
3. Response shapes for `/api/v2/branches` and `/api/v1/shipping-rate`.
4. How to cancel an order, or hold one, after create. Neither is documented.
5. Maximum batch size for `/api/v1/orders/statuses`, and why an id lands in `errors`.
6. What `payment_status` values exist, and how COD remittance to the vendor is reported.
7. Whether `vref_id` is checked for duplicates.
8. Parameters for `POST /api/v2/vendor/webhook`.
9. The full list of order statuses and webhook events, including `comment_added`, `returned_to_warehouse`, and the maximum ids in one bulk event.
10. Whether undocumented fields (`vendor_return`, `delivered_date`, `active`, a tracking id) and endpoints (`/order/redirectable`, `/vendor/ratings`, `/tickets/<id>/detail`) are supported for vendors.
11. Whether a parcel can still be collected after you decide to cancel it, and how to stop that.
12. Whether webhooks for one parcel arrive in order.
13. Which characters names and addresses may contain (Devanagari?), and the length limits per field.
14. Whether a bulk status call counts once or per id against the daily reads.
15. How to rotate a webhook secret without losing events.
16. Whether `cod_charge: "0"` is accepted for a prepaid order, and what the rider then collects.
17. Where branch ids come from, since the branch list's shape is undocumented and the redirect's `destination` needs one.
18. Whether `Delivery Attempted`, `Out for Delivery` and `Dispatched to <BRANCH>` are real status strings, and what `returned_to_warehouse` means.
19. Whether posting a comment is idempotent in any way, since no comment id is returned.
