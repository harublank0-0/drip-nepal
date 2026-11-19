---
name: ncm-integration
description: Use when adding, extending or debugging a Nepal Can Move (NCM, nepalcanmove.com) courier integration in an e-commerce or order-management project - creating parcels, delivery rates, branches, COD, NCM webhooks and webhook registration, delivery status sync, returns, redirects, pickup tickets, labels or comments - or when moving NCM code to the v2 API documentation.
---

# NCM courier integration

## Overview

NCM's API is small and loosely specified: token auth, string money, no
idempotency, no cancel endpoint, and webhooks that are **never retried** and
carry **no signature**. A correct integration is mostly about what you build
around it: a claim before creating a parcel, per-account matching, idempotent
and ordered status processing, polling reconciliation, and explicit business
decisions about returns, COD and stock.

This skill follows NCM's **API documentation v2** and webhook documentation
v1.1. "v2" is the document's version, not a URL prefix: create, detail, status,
comments and rates still live under `/api/v1/`. What changed from the previous
document is in [api-contract.md](references/api-contract.md#changes-from-the-v1-doc).

**Core rule:** keep NCM's documented contract exactly. Only a set of read-only
calls was checked against the live production API, on 2026-11-16; what they
returned is marked [observed 2026-11-16] and is real but unconfirmed by NCM.
Anything marked [observed 2026-11-16], [observed], [reported], [inferred] or
[unknown] must be confirmed with NCM before you depend on it. Test anything
that creates or changes data (create, comments, tickets, returns, redirects,
webhooks) with a demo token on the demo host, never on production. Anything marked
[v1 doc] is superseded: use it to recognise old code, never build on it. Adapt
everything else (states, stock, money, jobs) to the destination project, with
the user deciding the business rules.

## When to use

- Building NCM parcel creation, rate quotes or a branch picker.
- Receiving NCM webhooks, registering the webhook URL, or syncing delivery status by polling.
- Handling NCM returns (RTV), refunds, exchanges, redirects, pickup tickets, labels or comments.
- Updating NCM code written against the older API document (file dated `251222`).
- Debugging orders stuck on an NCM status, duplicate parcels, missing webhooks or
  wrong COD figures.

Not for other Nepali couriers. Their contracts differ; only the general patterns
in [checklists.md](references/checklists.md) transfer.

## First: read the destination project

Before proposing anything, find and write down:

| Look for | Why |
|---|---|
| The **order model** and every order status, plus where transitions happen | You will map NCM events onto these states |
| The **tenant model** (shop, vendor, store) and how a request is scoped to one | NCM ids are per account; every lookup must be account-scoped |
| **Credential storage**: encrypted columns, a secret manager, env vars | NCM tokens are per vendor account |
| The **background job system**, scheduler and dead-letter handling | Webhook processing, reconciliation and outbound comments need it |
| **Payment** rules: COD, prepaid, partial payment | They decide `cod_charge` |
| **Stock** rules: when an order takes and returns stock | Courier events must not silently break them |
| Notifications and SMS, and how they avoid duplicates | Courier events trigger customer messages |
| An existing courier abstraction, if any | Fit into it rather than adding a parallel one |
| Existing NCM calls, if any | Check them against the [changes from the v1 doc](references/api-contract.md#changes-from-the-v1-doc) |
| The test setup | Every rule below needs a test |

Don't assume a particular framework, ORM, queue or cloud provider. Use what the project has.

## Workflow

1. **Settle decisions D1–D11** in [checklists.md](references/checklists.md#decisions-to-settle-with-the-user-first) with the user. Never decide cancellation, returns, COD settlement or stock effects alone.
2. **Agree the status mapping.** Fill in the template in [webhooks-and-statuses.md](references/webhooks-and-statuses.md#mapping-template-recommended) row by row, for the project's real states. Every NCM event and status gets an explicit outcome, including "no order change".
3. **Implement in the order** in [checklists.md](references/checklists.md#implementation-order). Each step has a verification checkpoint; don't skip ahead.
4. **Write the tests** in the [testing checklist](references/checklists.md#testing-checklist), with synthetic data only.
5. **Hand over the open questions** for NCM from [open-questions.md](references/open-questions.md). If one is already answered there, use the answer; if the project depends on one still open, say so.

## Quick reference

| Need | NCM call |
|---|---|
| Create a parcel | `POST /api/v1/order/create` → `{"Message", "orderid"}` |
| A parcel's detail, COD, delivery charge | `GET /api/v1/order?id=` (money as decimal strings; live, `vendor_return` is the string `"False"`) |
| A parcel's status history | `GET /api/v1/order/status?id=` (newest first) |
| Many parcels' current status | `POST /api/v1/orders/statuses` `{"orders": [...]}` → `result` and `errors` (unknown ids land in `errors`) |
| Delivery charge | `GET /api/v1/shipping-rate?creation=&destination=&type=` → `{"charge": "<decimal string>"}`; branch **names** only |
| Branches; the account's pickup branches | `GET /api/v2/branches` (one unpaged array; `pk`, `code`, `name`; answered without a token, but send it); `GET /api/v2/vendor/assigned-branches` (names) |
| Comments | `GET /api/v1/order/comment?id=`, `GET /api/v1/order/getbulkcomments` (rows carry `pk`), `POST /api/v1/comment` |
| Return, exchange, redirect | `POST /api/v2/vendor/order/return`, `…/exchange-create`, `…/redirect` |
| Tickets, including pickup requests | `POST /api/v2/vendor/ticket/create/new` (`branch` required for `Pickup`), `…/ticket/cod/create`, `…/ticket/close/<id>` |
| Ticket detail; reply | `GET /api/v1/tickets/<id>/detail`; `POST /api/v1/vendor/tickets/<id>/response` (reopens a closed ticket) |
| Label data | `GET /api/v2/vendor/order/label/<id>`; `POST /api/v2/vendor/order/label/` `{"ids": [...]}` |
| Customers; a phone's record across NCM | `GET /api/v2/vendor/customers`, `…/customers/<id>/detail`; `GET /api/v2/vendor/ratings?phone=` |
| Register; test the webhook URL | `POST /api/v2/vendor/webhook` `{"webhook_url"}`; `POST /api/v2/vendor/webhook/test` |
| Webhooks in | `POST` to your URL; 2xx within 10 s; one shot, no retry |

Hosts: the documents use `https://demo.nepalcanmove.com`; production is
`https://portal.nepalcanmove.com` [observed 2026-11-16]. Demo and production
tokens are separate [reported]. Auth on every call: `Authorization: Token <token>`. Limits:
1,000 creates and 20,000 reads (detail, comments, status) a day. Full contract:
[api-contract.md](references/api-contract.md). Events, payloads and statuses:
[webhooks-and-statuses.md](references/webhooks-and-statuses.md).

## Common mistakes

| Mistake | Instead |
|---|---|
| Rewriting `/api/v1/` paths to `/api/v2/` because the docs are "v2" | Use each path exactly as the catalog lists it. Only the generic ticket path changed. |
| Filing tickets at `/api/v2/vendor/ticket/create`, or a `Pickup` ticket without `branch` | `/api/v2/vendor/ticket/create/new`, with `branch` set to a name from `assigned-branches`. |
| Retrying a timed-out create | Mark it unknown and have a person check. The API has **no lookup by `vref_id`**; the customer and label endpoints can help a person search, but a retry can make a second parcel. |
| Matching a webhook by NCM order id alone | Match by (account, id). One integration's code treats NCM ids as per-account sequences, so one id may exist under two accounts [observed]. |
| Restocking or refunding on an unsigned webhook alone | The only webhook auth is a URL secret. Confirm return, refund and other money or stock events with an API read first. |
| Treating `Delivered` as delivered to the customer | Check for a return first: RTV events or `vendor_return`. |
| Treating `Delivered` or `payment_status: "Completed"` as "vendor paid" | Settlement is separate and undocumented; agree the rule (D6). |
| Copying every NCM status onto the order | NCM sets `Sent for Pickup` for every new parcel (reported by one integration); staff-held and terminal states must stay. |
| Comparing raw status strings in the sweep | Compare normalised stages; `Delivered` on a returning parcel means returned. |
| One transaction for a 100-id bulk event | One transaction per parcel. |
| Relying on webhooks alone | Poll and reconcile; NCM never retries. |
| Calling NCM before claiming the local record (create, redirect, comment, ticket) | Claim first, call, then record. NCM has no idempotency keys. |
| Sending the rate `type` (`D2B`) or the label's `Office`/`Home` to create | Create takes `Door2Branch` and its three siblings; map between the vocabularies. |
| Showing a rate of `"0"` as free delivery, or quoting with `type=B2D` | Rate types are `Pickup/Collect`, `Send`, `D2B`, `B2B`. Any other `type` gets `200 {"charge": "0"}`; treat it as a failed quote. |
| Quoting rates by branch `code` or `pk` | Rates take branch **names**. Codes, pks and unknown names get HTTP 200 with an HTML error page; check that the body is JSON. |
| Reading `vendor_return` as a boolean | Live, it is the string `"False"`, which is truthy. Compare the text, and accept a real boolean too. |
| Assuming every money field is a string | Order detail and rates send decimal strings; the label's `cod_charge` came back as a JSON number. Parse both to a decimal. |
| Reading `id` from staff rows | Staff, branch and comment rows carry `pk`; customers carry `id`. |
| Reading `comment_id` from API comment rows, or matching comments on exact time | API rows carry `pk`, which equals the webhook's `comment_id` [reported]; the two channels' times differ by a fraction of a second. One integration stored every NCM comment twice this way. |
| Trusting NCM to reject a repeated `vref_id` | It doesn't: duplicates were all created [reported]. Make references unique per account. |
| Reading the webhook test's `success: true` as a pass | It answers 200 with `success: true` even when your server returned 400. Check `status_code`. |
| Assuming bulk labels come back in request order | Match on `orderid`; ids that aren't yours land in `not_found`. |
| Trusting the URL token in the receiver without checking it | Verify it in constant time before storing anything. |
| Returning NCM's raw error text to users, or logging full payloads | Map to safe messages; log ids and outcomes, not names, phones or addresses. |

## What production showed

[production-lessons.md](references/production-lessons.md) records how one live
integration was built, what failed, and which of its behaviours **not** to copy.
It was built against the older API document; its "Out of date since API doc v2"
section lists what moved. Read it before designing the status pipeline.
