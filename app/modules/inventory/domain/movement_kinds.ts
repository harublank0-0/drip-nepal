/*
 * `inventory_movements.kind` (docs/04a §8.3): the values of
 * `inventory_movements_kind_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4). docs/05 §5.2.
 */
export const MOVEMENT_KINDS = [
  'reserve',
  'release',
  'commit',
  'ship',
  'return_restock',
  'rto_restock',
  'adjustment',
  'stocktake',
  'correction',
] as const
export type MovementKind = (typeof MOVEMENT_KINDS)[number]
