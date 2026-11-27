import { STOCK_LIMITS } from '../constants/limits.js'
import type { VendorAdjustmentReason } from '../constants/inventory.js'
import { catalogEditable } from './shop_access.js'

/*
 * The stock page's rules (docs/08 §2.5 `/inventory`; 02 J-11; 06 §13.5
 * `adjustInventory`, `stocktakeInventory`; R1-S part 2f-iv-a), pure so the
 * dialogs and their tests share them.
 *
 * An adjustment is asked as a direction and a quantity, not a signed
 * number: "Add 5" or "Remove 2" is sent as `delta` 5 or -2. Each direction
 * offers the reasons that fit it; `data_entry_error` fits both, since a
 * mistake is corrected either way (02 J-11 "Recovery"). The server takes
 * any reason with any sign; the page only narrows the choice.
 */
export type StockDirection = 'add' | 'remove'

/*
 * Whether the page offers the stock changes: to a role with
 * `shop.inventory.adjust` while the shop may change its catalogue (the
 * writes' `products_edit` gate: `active` only). The UI hides; the server
 * decides (docs/08 §11.6).
 */
export function stockChangesOffered(
  shopStatus: string,
  may: (permission: 'shop.inventory.adjust') => boolean
) {
  return catalogEditable(shopStatus) && may('shop.inventory.adjust')
}

/*
 * What a movement changed, for the "Last change" column: on hand, else
 * reserved, or nothing at all (a count that confirmed the number, AC-J11-08,
 * or a `commit`, which moves no number, 05 §5.6).
 */
export function movementDelta(movement: {
  on_hand_delta: number
  reserved_delta: number
}): { column: 'on_hand' | 'reserved'; delta: number } | null {
  if (movement.on_hand_delta !== 0) return { column: 'on_hand', delta: movement.on_hand_delta }
  if (movement.reserved_delta !== 0) return { column: 'reserved', delta: movement.reserved_delta }
  return null
}

export const REASONS_FOR: Readonly<Record<StockDirection, readonly VendorAdjustmentReason[]>> = {
  add: ['received_stock', 'found', 'data_entry_error'],
  remove: ['sold_offline', 'damaged', 'lost', 'data_entry_error'],
}

export type AdjustValues = {
  direction: StockDirection
  quantity: string
  reason: VendorAdjustmentReason | ''
  note: string
}

export const emptyAdjust = (): AdjustValues => ({
  direction: 'add',
  quantity: '',
  reason: '',
  note: '',
})

export type QuantityProblem = 'required' | 'invalid' | 'too_small' | 'too_large'

/*
 * A typed quantity's problem: whole units only, from `min` (1 for an
 * adjustment, 0 for a count) to the `int` column's limit (04a §8.1).
 */
export function quantityProblem(text: string, min: number): QuantityProblem | null {
  const trimmed = text.trim()
  if (trimmed === '') return 'required'
  if (!/^\d+$/.test(trimmed)) return 'invalid'
  const units = Number(trimmed)
  if (units < min) return 'too_small'
  if (units > STOCK_LIMITS.units.max) return 'too_large'
  return null
}

// The reason a direction keeps when the direction changes: the same one if it fits, or none.
export function reasonFor(direction: StockDirection, reason: AdjustValues['reason']) {
  return reason !== '' && REASONS_FOR[direction].includes(reason) ? reason : ''
}

// The `adjustInventory` body for `values`; a blank note is no note.
export function adjustBody(values: AdjustValues) {
  const units = Number(values.quantity.trim())
  const note = values.note.trim()
  return {
    delta: values.direction === 'add' ? units : -units,
    reason_code: values.reason as VendorAdjustmentReason,
    note: note === '' ? null : note,
  }
}

type ProblemLike = { code: string; errors?: ({ code: string } & Record<string, unknown>)[] }

/*
 * A 409 `below_reserved` item (05 §8.13, 06 §5.1): on hand and reserved
 * now, with the reserved units split into those committed to shop orders
 * the vendor can act on (their numbers, at most a few) and those held for
 * payments in progress (a count only).
 */
export type BelowReserved = {
  onHand: number
  reserved: number
  committed: number
  orders: string[]
  held: number
}

export function belowReservedOf(problem: ProblemLike): BelowReserved | null {
  const item = problem.errors?.find((entry) => entry.code === 'below_reserved')
  if (problem.code !== 'CONFLICT' || !item) return null
  if (typeof item.on_hand !== 'number' || typeof item.reserved !== 'number') return null
  const count = (value: unknown) => (typeof value === 'number' ? value : 0)
  const orders = Array.isArray(item.committed_shop_orders)
    ? item.committed_shop_orders.filter((value): value is string => typeof value === 'string')
    : []
  return {
    onHand: count(item.on_hand),
    reserved: count(item.reserved),
    committed: count(item.reserved_committed),
    orders,
    held: count(item.reserved_held),
  }
}

/*
 * The refusal as 05 §8.13 words it, from the number the change would have
 * set (`target`): below zero; reserved for open orders (their numbers when
 * given); reserved for a payment in progress, released automatically if
 * the payment does not complete; or split between the two.
 */
export type BelowReservedCopy = {
  key: 'below_zero' | 'reserved_for_orders' | 'reserved_for_payment' | 'reserved_split'
  values: Record<string, string | number>
}

export function belowReservedCopy(refusal: BelowReserved, target: number): BelowReservedCopy {
  const named = refusal.orders
  const orders =
    named.length === 0
      ? ''
      : ` ${named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named.at(-1)}`}`
  if (refusal.reserved === 0) return { key: 'below_zero', values: { target } }
  if (refusal.held === 0) {
    return { key: 'reserved_for_orders', values: { target, reserved: refusal.reserved, orders } }
  }
  if (refusal.committed === 0) {
    return { key: 'reserved_for_payment', values: { target, reserved: refusal.reserved } }
  }
  return {
    key: 'reserved_split',
    values: {
      target,
      reserved: refusal.reserved,
      committed: refusal.committed,
      orders,
      held: refusal.held,
    },
  }
}

// A 409 `stock_changed` item of a count: on hand and reserved as they are now.
export function stockChangedOf(problem: ProblemLike): { onHand: number; reserved: number } | null {
  const item = problem.errors?.find((entry) => entry.code === 'stock_changed')
  if (problem.code !== 'CONFLICT' || !item || typeof item.on_hand !== 'number') return null
  return { onHand: item.on_hand, reserved: typeof item.reserved === 'number' ? item.reserved : 0 }
}
