import type { StockChange } from '#modules/inventory/internal/vendor_stock'
import type { InventoryListItem } from '#modules/inventory/queries'

/*
 * The seller views of stock (docs/06 §13.5, §14.3; `InventoryChange` and
 * `InventoryListItem` in openapi.yaml; R1-S part 2c). `on_hand` is
 * shop-confidential and appears in seller views only (docs/04a §8.1);
 * `available` is `on_hand - reserved`, never stored (05 §5.1).
 */
export function inventoryChangeJson(change: StockChange) {
  const { stock, movement } = change
  return {
    variant_id: stock.variantId,
    on_hand: stock.onHand,
    reserved: stock.reserved,
    available: stock.onHand - stock.reserved,
    version: stock.version,
    movement: {
      id: movement.id,
      kind: movement.kind,
      on_hand_delta: movement.onHandDelta,
      reserved_delta: movement.reservedDelta,
      reason_code: movement.reasonCode,
      created_at: movement.createdAt.toISOString(),
    },
  }
}

export function inventoryListItemJson(item: InventoryListItem) {
  return {
    product_id: item.productId,
    public_id: item.publicId,
    title: item.title,
    status: item.status,
    updated_at: item.updatedAt.toISOString(),
    variants: item.variants.map((variant) => ({
      variant_id: variant.id,
      sku: variant.sku,
      label: variant.label,
      is_default: variant.isDefault,
      on_hand: variant.onHand,
      reserved: variant.reserved,
      available: variant.onHand - variant.reserved,
      version: variant.version,
      last_movement: variant.lastMovement
        ? {
            kind: variant.lastMovement.kind,
            reason_code: variant.lastMovement.reasonCode,
            on_hand_delta: variant.lastMovement.onHandDelta,
            reserved_delta: variant.lastMovement.reservedDelta,
            created_at: variant.lastMovement.createdAt.toISOString(),
          }
        : null,
    })),
  }
}
