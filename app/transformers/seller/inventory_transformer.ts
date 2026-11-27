import type { StockChange } from '#modules/inventory/domain/stock_change'
import type { InventoryListItem, StockMovement } from '#modules/inventory/queries'
import type { shopVariant } from '#modules/catalog/queries'

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
      status: variant.status,
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

type ShopVariant = NonNullable<Awaited<ReturnType<typeof shopVariant>>>

// The movement kinds an order or a shipment causes; their actor is the order, never a person.
const ORDER_KINDS = new Set([
  'reserve',
  'release',
  'commit',
  'ship',
  'return_restock',
  'rto_restock',
])

/*
 * Who made a movement, as the stock history shows it (R1-S part 2f-iv-b):
 * `you`, the shop's `owner`, a member's role, `former_member`, `staff`
 * (DripNepal, whose drift repair is a `correction`, 05 §5.10), `order` for
 * what a reservation, a shipment or a return moves (`reserve`, `release`,
 * `commit`, `ship`, `return_restock`, `rto_restock`; 04a §8.3), and
 * `system` for none. A vendor change is made by the owner or a member, so
 * an actor `roles` does not know is staff; when shop ownership can move
 * (R2), a former owner needs its own label. Never a name or an email
 * address (docs/07 §5.1 minimisation). `roles` comes from `shopRolesOf`.
 */
export function movementActor(
  movement: Pick<StockMovement, 'kind' | 'actorUserId'>,
  roles: ReadonlyMap<string, string>,
  viewerId: string
): string {
  if (ORDER_KINDS.has(movement.kind)) return 'order'
  if (movement.kind === 'correction') return 'staff'
  if (!movement.actorUserId) return 'system'
  if (movement.actorUserId === viewerId) return 'you'
  return roles.get(movement.actorUserId) ?? 'staff'
}

/*
 * The stock history page's variant (docs/08 §2.5 `/inventory/{variantId}`;
 * R1-S part 2f-iv-b): the variant with its product and its stock now.
 */
export function stockHistoryVariantJson(
  variant: ShopVariant,
  stock: { onHand: number; reserved: number; version: number }
) {
  return {
    variant_id: variant.id,
    sku: variant.sku,
    label: variant.label,
    is_default: variant.isDefault,
    status: variant.status,
    on_hand: stock.onHand,
    reserved: stock.reserved,
    available: stock.onHand - stock.reserved,
    version: stock.version,
    product: {
      product_id: variant.product.id,
      public_id: variant.product.publicId,
      title: variant.product.title,
      status: variant.product.status,
    },
  }
}

// One movement of the history: what changed, why, who, and the request that made it.
export function stockMovementJson(
  movement: StockMovement,
  roles: ReadonlyMap<string, string>,
  viewerId: string
) {
  return {
    id: movement.id,
    kind: movement.kind,
    reason_code: movement.reasonCode,
    on_hand_delta: movement.onHandDelta,
    reserved_delta: movement.reservedDelta,
    note: movement.note,
    actor: movementActor(movement, roles, viewerId),
    request_id: movement.requestId,
    created_at: movement.createdAt.toISOString(),
  }
}
