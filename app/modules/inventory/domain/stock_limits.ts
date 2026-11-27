/*
 * The largest `on_hand` the `int` column holds (docs/04a §8.1). The stock
 * validators bound their numbers by it, and `adjustInventory` refuses a
 * result above it with 422 `max` instead of the database's 22003 (R1-S part
 * 2c).
 */
import { STOCK_LIMITS } from '#shared/constants/limits'

export const STOCK_MAX = STOCK_LIMITS.units.max
