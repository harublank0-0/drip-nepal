# Research: NCM Reference Integration

Part of the [research digests](README.md) (digest name `ncm_reference_integration`). Reported to the product owner on 2026-11-20. This is a dated snapshot: none of it is confirmed by Nepal Can Move (NCM).

**What this is.** On 2026-11-20 the product owner answered the 11 questions DripNepal had drafted for NCM from another platform of theirs, whose NCM integration has run in production for some months, by reading that integration's code and production data. The reply says what that code does, what NCM's documents say and what the production data shows. It is not NCM's answer: every item still ends with a question for NCM. The product owner sent the same questions to NCM on 2026-11-20; no answer yet. The other platform is not named here, and its volume figures are rounded or left out, because this repository is public.

**How to read it.** Each fact starts with a tag:

- `[ncm-doc]`: stated in NCM's API document v2 or webhook document v1.1, which NCM gave the product owner and which are kept out of the repository ([risks VX-16](../risks-and-open-decisions.md#31-register)).
- `[reported]`: seen in the reference integration's code or production data, as its maintainers report it; not confirmed by NCM.
- `[inferred]`: a conclusion the maintainers draw from the reported facts.

The "Bearing on DripNepal" lines point to the document that owns the design; they decide nothing. The `ncm-integration` skill keeps its own list of questions for NCM ([.agents/skills/ncm-integration/references/open-questions.md](../../.agents/skills/ncm-integration/references/open-questions.md)); the skill numbers are given with each heading so the skill can be updated from this file.

## 1. Cancelling a booking (skill questions 4 and 5)

- [ncm-doc] There is no cancel endpoint, and a booking has no hold option. The ticket types are General, Order Processing, Return and Pickup; none is meant for cancelling.
- [reported] When an order is cancelled, the integration posts the comment "Order cancelled." to the parcel. A failure is only logged, and nobody knows whether NCM acts on the comment. Its status sync follows a cancelled order's parcel for 14 days; if NCM collects it anyway, the order stays cancelled and staff are asked to check with NCM.
- [reported] Parcels keep moving after a cancel. Early in November, several dozen cancelled orders' parcels were still at `Pickup Order Created`, two at `Sent for Pickup`, and one was delivered.
- **Still to ask NCM:** how to stop a pickup, and which ticket type to use for it.
- **Bearing on DripNepal:** consistent with the "without `cancellation`" path of [05 §6.3](../05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment): a cancellation of a `booked` shipment is a request that staff settle with NCM outside the API. A comment alone does not stop a parcel, and which ticket type staff would use is the open question above.

## 2. Webhook security, secret changes and retries (skill question 17; the header list also bears on 24)

- [reported] Webhooks carry no signature. NCM sends only `Content-Type`, `Content-Length` and `User-Agent: NCM-Webhook/1.0`.
- [ncm-doc] NCM's own suggestion is a secret in the URL, which the integration uses.
- [ncm-doc] NCM never resends a failed webhook.
- [reported] A webhook alone never moves stock or money in that integration: a delivery webhook reads NCM's order detail before deciding between delivered and returned, and every delivered order is read again before a payout is approved. A status sync six times a day catches missed webhooks.
- [reported] Changing the URL secret today would lose the events sent during the switch, because the receiver accepts exactly one secret. A clean change needs the old and the new secret accepted for a while.
- **Still to ask NCM:** whether a new URL set through `POST /api/v2/vendor/webhook` takes effect at once, and whether events already in flight still go to the old URL.
- **Bearing on DripNepal:** consistent with [04a §9.14](../04a-data-dictionary-tables.md#914-courier_events) "Callback authentication" (a secret in the URL, the previous key's secret accepted during a key rotation) and with [05 §6.3](../05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment), where a callback is a trigger, not an update, and the courier's own record decides.

## 3. Rate limits (skill question 2)

- [ncm-doc] 1,000 order creates and 20,000 "Order View (Detail, Comments, Status)" calls a day.
- [reported] Responses carry no rate-limit headers, so the remaining budget cannot be read. The integration counts nothing and does not handle a 429.
- [reported] The largest single cost there is a payout check that reads every delivered order of a shop, so a shop with a couple of thousand deliveries spends as many reads at once. All the shops on one NCM account share one token.
- [inferred] If the limit is per token, those shops also share one daily budget.
- **Still to ask NCM:** whether the limit is per token, when it resets and what an exceeded limit returns; whether a bulk status call counts once or once per ID; and whether rates, branches, labels, tickets and ratings count at all.
- **Bearing on DripNepal:** an M6 planning input for the tracking and reconciliation jobs of [05 §6.3](../05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment), in particular on a platform-owned account shared by many shops ([risks VX-17](../risks-and-open-decisions.md#31-register)).

## 4. Field limits (skill question 16)

- [ncm-doc] `vref_id` is optional, with no length given. The only documented length is 500 characters for a ticket message.
- [reported] The integration sends references of at most a few digits, so it has no evidence for or against the 15-character limit DripNepal saw on NCM's demo host ([risks OD-61](../risks-and-open-decisions.md#22-decision-table)).
- [reported] It strips every non-ASCII character from the name, address, package and instruction before sending them, a rule added without a recorded source. A name written only in Devanagari reaches NCM as "Customer", and an address written only in Devanagari is replaced by the destination branch name.
- [reported] Its own caps, none of them from NCM: an instruction of at most 100 characters (a longer one is refused), comments cut at 500 characters, a pickup ticket message in two parts of 250 characters, the phone's last 10 digits, and no cap on name or address.
- **Still to ask NCM:** which characters each field accepts, Devanagari included, and the length limit of each field.
- **Bearing on DripNepal:** OD-61 rests on the demo observation alone. Whether DripNepal's recipient names and addresses may be sent in Devanagari is open until NCM answers; it is an M6 input to the booking terms of [05 §6.3](../05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment).

## 5. Finding a parcel by our reference (skill question 8)

- [ncm-doc] There is no lookup by `vref_id`.
- [reported] A slow workaround, which NCM does not document for this: search customers by phone, take that customer's orders, and read their labels, whose `vendor_orderid` seems to repeat `vref_id`.
- [reported] NCM does not refuse a repeated reference: in that integration's data, more than two dozen references were sent by two or more shops on one account, and NCM created a parcel for every one. A booking that timed out (after 15 seconds) is logged as unknown and nothing is stored, so a retry can create a second parcel.
- **Still to ask NCM:** whether a lookup by `vref_id`, or any duplicate protection on create, exists or could be added.
- **Bearing on DripNepal:** consistent with the "without `reference_lookup`" path of [05 §6.3](../05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment): an `unknown` booking goes to `needs_reconciliation` at once, with no retry. DripNepal's `merchant_reference` is unique ([04a §11.5](../04a-data-dictionary-tables.md#115-shipments)), which a lookup would need.

## 6. Statuses and events (skill questions 13, 15 and 20)

- [reported] All 10 documented webhook events arrive, plus three undocumented ones: `comment_added`; `returned_to_warehouse`, which carries a `returnReason`; and, rarely, `exchange_initiated`, which the integration drops.
- [reported] `Dispatched to <BRANCH>` and `Arrived at <BRANCH>` are real, but only in the status API. `Out for Delivery` and `Delivery Attempted` never appeared in four and a half months.
- [reported] Nobody there knows what `Returned to Warehouse` or `exchange_initiated` mean; the integration treats `Returned to Warehouse` as a step in a return.
- [reported] Over more than 4,000 parcels, no parcel received its webhooks out of order. The integration still ignores a webhook older than one it has saved.
- **Still to ask NCM:** the official lists of statuses and events, what those two mean, whether events for one parcel always arrive in order, and whether 100 IDs is the most one bulk event holds.
- **Bearing on DripNepal:** the mapping of [05 §6.3](../05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment) has no row for `Returned to Warehouse`, so a parcel that reaches it would be `held` (`unmapped_status`) with an admin alert. The skill's questions 13 and 20 ask NCM what it means.

## 7. Undocumented fields (skill questions 14 and 27)

- [reported] `vendor_return` was always the string `"True"` or `"False"`, over more than 9,000 rows.
- [reported] The integration relies on `delivered_date` for the delivery time, on `trackid` to match webhooks, and on `/order/redirectable` for a list of parcels that can be redirected.
- [reported] Money is text in the order detail and in rates, but the label's `cod_charge` is a JSON number.
- **Still to ask NCM:** whether vendors may rely on these fields and that endpoint, and whether the money types will stay as they are.
- **Bearing on DripNepal:** supports the `vendor_return` parsing of `T-FUL-109` ([10 §6](../10-testing-and-quality-gates.md#6-test-id-registry)).

## 8. `Pickup/Collect` for a `Door2Door` booking (new; not in the skill's list)

- [ncm-doc] NCM's rate table calls `Door2Door` "Pickup/Collect" ("NCM pickup & delivery").
- [reported] The integration's rate quotes always ask for `Pickup/Collect`.
- [inferred] The `delivery_type: "Pickup/Collect"` that NCM's demo host returned for a `Door2Door` booking on 2026-11-19 ([risks VX-16](../risks-and-open-decisions.md#31-register)) is very likely NCM's internal name for the same service. The integration never reads `delivery_type` from a response, so it could not check this.
- **Still to ask NCM:** to confirm.

## 9. Pickup address (skill question 10)

- [ncm-doc] A booking carries no pickup address, only `fbranch`, the origin branch name.
- [reported] NCM does not check `fbranch`: for most of that platform's shops it is not one of the account's assigned pickup branches, and their bookings still succeed.
- [reported] The integration files a Pickup ticket that names an assigned branch (on 15 November, its account had one). The ticket's message carries the shop's address, the number of parcels and the contact phones.
- [inferred] So for many shops on one account, the ticket message is the only place NCM learns where to go, which in practice means one pickup ticket per shop.
- **Still to ask NCM:** what `fbranch` is for, and whether one account can register several pickup addresses.
- **Bearing on DripNepal:** narrows the open part of [risks VX-17](../risks-and-open-decisions.md#31-register) (how NCM tells pickup points apart) for platform-owned accounts.

## 10. COD payouts (skill question 7)

- [ncm-doc] No payout schedule, fee list or statement is documented. A COD transfer ticket exists.
- [ncm-doc] The document shows `payment_status` as `"Completed"`.
- [reported] `"Delivery Pending"` was seen live.
- [reported] Per-parcel figures already available: the order detail has `cod_charge` and `delivery_charge`; the `delivery_completed` webhook carries both too, though this is not documented; `rtv_delivery` carries a `delivery_charge` per order, which suggests a return charge.
- [reported] The integration owes a shop the COD of its delivered, not returned, cash orders minus NCM's delivery charge. It never subtracts a return charge, does not use `payment_status`, and marks a payout paid by hand, with nothing confirming that NCM paid.
- **Still to ask NCM:** how often NCM pays out, which charges it deducts (returns included), whether there is a statement per parcel, and the full list of `payment_status` values.
- **Bearing on DripNepal:** [risks VX-18](../risks-and-open-decisions.md#31-register) and OD-58 stay open.

## 11. Prepaid parcels (skill question 18)

- [reported] A prepaid order is sent with `cod_charge: "0"`, and NCM accepts it: such parcels were delivered.
- [reported] The integration sends any order with a storefront prepayment above zero as `"0"` too, so if `"0"` means the rider collects nothing, the rest of a part-prepaid order's price is never collected.
- **Still to ask NCM:** what the rider collects when `cod_charge` is 0, and whether the delivery charge is then billed to the vendor.
- **Bearing on DripNepal:** an input for gateway-paid orders on the courier path (M8).
