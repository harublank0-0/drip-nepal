---
name: ncm-integration
description: Use when adding, extending or debugging a Nepal Can Move (NCM, nepalcanmove.com) courier integration in an e-commerce or order-management project - creating parcels, delivery rates, branches, COD, NCM webhooks, delivery status sync, returns, redirects, tickets or comments.
---

# NCM courier integration

## Overview

NCM's API is small and loosely specified: token auth, string money, no
idempotency, no cancel endpoint, and webhooks that are **never retried** and
carry **no signature**. A correct integration is mostly about what you build
around it: a claim before creating a parcel, per-account matching, idempotent
and ordered status processing, polling reconciliation, and explicit business
decisions about returns, COD and stock.

**Core rule:** keep NCM's documented contract exactly. Nothing in this package
was checked against the live API, so anything marked [observed], [reported],
[inferred] or [unknown] must be confirmed with NCM or a demo token before you
depend on it. Adapt
everything else (states, stock, money, jobs) to the destination project, with
the user deciding the business rules.

## When to use

- Building NCM parcel creation, rate quotes or a branch picker.
- Receiving NCM webhooks, or syncing delivery status by polling.
- Handling NCM returns (RTV), refunds, exchanges, redirects, tickets or comments.
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
| The test setup | Every rule below needs a test |

Don't assume a particular framework, ORM, queue or cloud provider. Use what the project has.

## Workflow

1. **Settle decisions D1–D11** in [checklists.md](references/checklists.md#decisions-to-settle-with-the-user-first) with the user. Never decide cancellation, returns, COD settlement or stock effects alone.
2. **Agree the status mapping.** Fill in the template in [webhooks-and-statuses.md](references/webhooks-and-statuses.md#mapping-template-recommended) row by row, for the project's real states. Every NCM event and status gets an explicit outcome, including "no order change".
3. **Implement in the order** in [checklists.md](references/checklists.md#implementation-order). Each step has a verification checkpoint; don't skip ahead.
4. **Write the tests** in the [testing checklist](references/checklists.md#testing-checklist), with synthetic data only.
5. **Hand over the open questions** for NCM from [api-contract.md](references/api-contract.md#what-to-ask-ncm-before-go-live).

## Quick reference

| Need | NCM call |
|---|---|
| Create a parcel | `POST /api/v1/order/create` → `{"Message", "orderid"}` |
| A parcel's detail, COD, delivery charge | `GET /api/v1/order?id=` |
| A parcel's status history | `GET /api/v1/order/status?id=` (newest first) |
| Many parcels' current status | `POST /api/v1/orders/statuses` `{"orders": [...]}` → `result` and `errors` |
| Delivery charge | `GET /api/v1/shipping-rate?creation=&destination=&type=` |
| Branches | `GET /api/v2/branches` |
| Comments | `GET /api/v1/order/comment?id=`, `GET /api/v1/order/getbulkcomments`, `POST /api/v1/comment` |
| Return, exchange, redirect | `POST /api/v2/vendor/order/return`, `…/exchange-create`, `…/redirect` |
| Tickets | `POST /api/v2/vendor/ticket/create`, `…/ticket/cod/create`, `…/ticket/close/<id>` |
| Webhooks in | `POST` to your URL; 2xx within 10 s; one shot, no retry |

Auth on every call: `Authorization: Token <token>`. Limits: 200 creates and
5,000 reads a day. Full contract: [api-contract.md](references/api-contract.md).
Events, payloads and statuses: [webhooks-and-statuses.md](references/webhooks-and-statuses.md).

## Common mistakes

| Mistake | Instead |
|---|---|
| Retrying a timed-out create | Mark it unknown and have a person check NCM's portal. The API has **no lookup by `vref_id`**; every documented read takes NCM's own id. A retry can make a second parcel. |
| Matching a webhook by NCM order id alone | Match by (account, id). One integration's code treats NCM ids as per-account sequences, so one id may exist under two accounts [observed]. |
| Restocking or refunding on an unsigned webhook alone | The only webhook auth is a URL secret. Confirm return, refund and other money or stock events with an API read first. |
| Treating `Delivered` as delivered to the customer | Check for a return first: RTV events or `vendor_return`. |
| Treating `Delivered` or `payment_status: "Completed"` as "vendor paid" | Settlement is separate and undocumented; agree the rule (D6). |
| Copying every NCM status onto the order | NCM sets `Sent for Pickup` for every new parcel (reported by one integration); staff-held and terminal states must stay. |
| Comparing raw status strings in the sweep | Compare normalised stages; `Delivered` on a returning parcel means returned. |
| One transaction for a 100-id bulk event | One transaction per parcel. |
| Relying on webhooks alone | Poll and reconcile; NCM never retries. |
| Calling NCM before claiming the local record (create, redirect, comment) | Claim first, call, then record. NCM has no idempotency keys. |
| Sending the rate `type` (`D2B`) to create | Create takes `Door2Branch`; map between them. |
| Trusting the URL token in the receiver without checking it | Verify it in constant time before storing anything. |
| Returning NCM's raw error text to users, or logging full payloads | Map to safe messages; log ids and outcomes, not names, phones or addresses. |

## What production showed

[production-lessons.md](references/production-lessons.md) records how one live
integration was built, what failed, and which of its behaviours **not** to copy.
Read it before designing the status pipeline.
