import vine from '@vinejs/vine'
import { VENDOR_ADJUSTMENT_REASONS } from '#modules/inventory/domain/movement_reasons'
import { STOCK_MAX } from '#modules/inventory/domain/stock_limits'
import { STOCK_LIMITS } from '#shared/constants/limits'
import { clearableNfcText } from '#validators/support/nfc_text'

/*
 * `adjustInventory` (docs/06 §13.5; `AdjustInventoryRequest` in
 * openapi.yaml; 05 §5.9; R1-S part 2c). The members are the whole input:
 * anything else, `shop_id` included, is refused with `unknown_field` before
 * this runs (`assertKnownMembers`, T-SEC-003).
 *
 * - `delta`: a signed integer, never 0 (`not_zero`, 02 J-11 "Validation"),
 *   within the `int` column's range (`inventory_items.on_hand`, 04a §8.1).
 * - `reason_code`: one of the six vendor reasons of
 *   `inventory_movements_reason_code_check` (04a §8.3); `correction`,
 *   `stocktake` and anything else are `enum` (AC-J11-07).
 * - `note`: optional NFC text of at most 500 characters
 *   (`inventory_movements_note_check`); a blank is no note.
 */
export const ADJUST_INVENTORY_MEMBERS = ['delta', 'reason_code', 'note'] as const

const notZero = vine.createRule((value, _options, field) => {
  if (value === 0) field.report('The {{ field }} field must not be 0', 'notZero', field)
})

export const adjustInventoryValidator = vine.create({
  delta: vine
    .number({ strict: true })
    .withoutDecimals()
    .range([-STOCK_MAX, STOCK_MAX])
    .use(notZero()),
  reason_code: vine.enum(VENDOR_ADJUSTMENT_REASONS),
  note: clearableNfcText({ min: 1, max: STOCK_LIMITS.note.max }).nullable().optional(),
})
