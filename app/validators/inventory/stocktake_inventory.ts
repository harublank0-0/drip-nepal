import vine from '@vinejs/vine'
import { STOCK_MAX } from '#modules/inventory/domain/stock_limits'

/*
 * `stocktakeInventory` (docs/06 §13.5; `StocktakeInventoryRequest` in
 * openapi.yaml; 05 §5.9; R1-S part 2c). The members are the whole input,
 * as for `adjustInventory`. `counted_quantity` and `expected_on_hand` are
 * integers from 0 to the `int` column's limit (04a §8.1).
 */
export const STOCKTAKE_INVENTORY_MEMBERS = ['counted_quantity', 'expected_on_hand'] as const

const units = () => vine.number({ strict: true }).withoutDecimals().range([0, STOCK_MAX])

export const stocktakeInventoryValidator = vine.create({
  counted_quantity: units(),
  expected_on_hand: units(),
})
