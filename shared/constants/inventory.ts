/*
 * The reasons a vendor chooses for a stock `adjustment` (docs/05 §5.2,
 * 04a §8.3 `inventory_movements_reason_code_check`): shared so the server's
 * validator and the stock page offer one list (R1-S part 2f-iv-a). The
 * inventory module re-exports it beside the rest of the column's values,
 * which T-ARCH-011 compares with the constraint.
 */
export const VENDOR_ADJUSTMENT_REASONS = [
  'received_stock',
  'damaged',
  'lost',
  'found',
  'sold_offline',
  'data_entry_error',
] as const
export type VendorAdjustmentReason = (typeof VENDOR_ADJUSTMENT_REASONS)[number]
