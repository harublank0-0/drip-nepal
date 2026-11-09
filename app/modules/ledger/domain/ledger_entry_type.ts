/*
 * `ledger_entries.entry_type` (docs/04a §13.1): the values of
 * `ledger_entries_type_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4). Signs and references per type: docs/05 §7.
 */
export const LEDGER_ENTRY_TYPES = [
  'sale',
  'shipping_income',
  'commission',
  'commission_reversal',
  'cod_cash_held',
  'refund',
  'vendor_remittance',
  'payout',
  'payout_reversal',
  'tax_withholding',
  'adjustment',
] as const
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number]
