/*
 * A vendor's stock change as `adjustInventory` and `stocktakeInventory`
 * answer it (docs/06 §14.3, `InventoryChange` in openapi.yaml; R1-S part
 * 2c): the stock row after the change and the movement written with it.
 * Pure types, so the seller transformer can read them (docs/09 §2.1).
 */
export type StockRow = { variantId: string; onHand: number; reserved: number; version: number }

export type MovementRow = {
  id: string
  kind: 'adjustment' | 'stocktake'
  onHandDelta: number
  reservedDelta: number
  reasonCode: string
  createdAt: Date
}

export type StockChange = { stock: StockRow; movement: MovementRow }
