/*
 * `inventory_movements.reason_code` (docs/04a §8.3): the values of
 * `inventory_movements_reason_code_check`, in its order. T-ARCH-011 fails if
 * the two differ (docs/04 §2.4). The reasons a vendor chooses for an
 * `adjustment` (docs/05 §5.2); a `stocktake` has reason `stocktake` and an
 * admin `correction` has `drift_repair`. The validator takes
 * `vine.enum(VENDOR_ADJUSTMENT_REASONS)` (docs/09 §3.6); the list lives in
 * shared/constants/inventory.ts, so the stock page offers the same one.
 */
export { VENDOR_ADJUSTMENT_REASONS, type VendorAdjustmentReason } from '#shared/constants/inventory'
