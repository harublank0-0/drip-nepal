import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import {
  stockVariantsOf,
  listShopProducts,
  type StockVariant,
  type ProductListItem,
  type Seek,
} from '#modules/catalog/queries'
import type { MovementKind } from '#modules/inventory/domain/movement_kind'

/*
 * The inventory module's reads (docs/09 §2.2; R1-S part 2a). Stock is
 * shop-confidential: `on_hand` appears only in seller views (docs/04a §8.1).
 */

// `on_hand` per variant of the shop; a variant without a row is absent. Pool by default.
export async function onHandOf(
  shopId: string,
  variantIds: readonly string[],
  client: QueryClientContract = db.connection()
): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map()
  const rows: { variant_id: string; on_hand: number }[] = await client
    .from('inventory_items')
    .where('shop_id', shopId)
    .whereIn('variant_id', [...variantIds])
    .select('variant_id', 'on_hand')
  return new Map(rows.map((row) => [row.variant_id, row.on_hand]))
}

/*
 * The variants among `variantIds` that have history: an inventory movement
 * (`inventory_movements_variant_history_idx`) or an order line
 * (`order_items_variant_idx`). Such a variant is archived, never deleted,
 * keeps its options, and fixes its product's axes (docs/04a §7.8, §7.9).
 * `replaceProductVariants` calls it with the variants' stock rows locked, so
 * a concurrent stock adjustment either committed first and shows here, or
 * waits; the seller views read it through `variantStock` without locks, as
 * a snapshot (R1-S part 2f-ii).
 */
export async function variantsWithHistory(
  client: QueryClientContract,
  variantIds: readonly string[]
): Promise<Set<string>> {
  if (variantIds.length === 0) return new Set()
  const ids = [...variantIds]
  const result = await client.rawQuery(
    `SELECT DISTINCT variant_id FROM inventory_movements WHERE variant_id = ANY(?::uuid[])
     UNION
     SELECT DISTINCT variant_id FROM order_items WHERE variant_id = ANY(?::uuid[])`,
    [ids, ids]
  )
  return new Set((result.rows as { variant_id: string }[]).map((row) => row.variant_id))
}

/*
 * What the seller views show of a product's variants' stock (docs/06 §13.5
 * `SellerVariant`; R1-S part 2f-ii): `on_hand` per variant, and the
 * variants with history, whose options the variant editor keeps (04a §7.9).
 */
export type VariantStock = {
  onHand: ReadonlyMap<string, number>
  history: ReadonlySet<string>
}

export async function variantStock(
  shopId: string,
  variantIds: readonly string[],
  client: QueryClientContract = db.connection()
): Promise<VariantStock> {
  return {
    onHand: await onHandOf(shopId, variantIds, client),
    history: await variantsWithHistory(client, variantIds),
  }
}

export type LastMovement = {
  kind: MovementKind
  reasonCode: string
  onHandDelta: number
  reservedDelta: number
  createdAt: Date
}

type ProductStatus = ProductListItem['status']

export type InventoryListVariant = StockVariant & {
  onHand: number
  reserved: number
  version: number
  lastMovement: LastMovement | null
}

export type InventoryListItem = {
  productId: string
  publicId: string
  title: string
  status: ProductStatus
  updatedAt: Date
  variants: InventoryListVariant[]
}

/*
 * `listInventory` (docs/06 §13.5, §6.3; 02 J-11 step 1; R1-S part 2c): the
 * shop's stock by product, with the product list's filters, order and
 * cursor (`listShopProducts`: newest change first, `status`, `q`), each
 * product with its active variants and, after them, its archived variants
 * that still hold stock (`on_hand` or `reserved` above 0), each with its
 * status: an archived variant keeps its stock row, which may still be
 * adjusted or counted (docs/05 §5.9; R1-S part 2f-iv-b). Each has its SKU,
 * label, `on_hand`, `reserved` and the latest movement, read by
 * `inventory_movements_variant_history_idx`. A variant without a stock row
 * (none should exist) shows 0 and 0, so an archived one is left out.
 */
export async function listInventory(filters: {
  shopId: string
  status?: ProductStatus
  q?: string
  limit: number
  seek: Seek | null
}): Promise<{ items: InventoryListItem[]; last: Seek | null }> {
  const client = db.connection()
  const page = await listShopProducts(filters)
  const variants = await stockVariantsOf(
    client,
    filters.shopId,
    page.items.map((item) => item.id)
  )
  const variantIds = [...variants.values()].flat().map((variant) => variant.id)
  const stock = new Map<string, Record<string, unknown>>()
  if (variantIds.length > 0) {
    const result = await client.rawQuery(
      `SELECT i.variant_id, i.on_hand, i.reserved, i.version,
              m.kind, m.reason_code, m.on_hand_delta, m.reserved_delta, m.created_at
         FROM inventory_items i
         LEFT JOIN LATERAL (
           SELECT kind, reason_code, on_hand_delta, reserved_delta, created_at
             FROM inventory_movements
            WHERE variant_id = i.variant_id
            ORDER BY created_at DESC, id DESC
            LIMIT 1) m ON true
        WHERE i.shop_id = ? AND i.variant_id = ANY(?::uuid[])`,
      [filters.shopId, variantIds]
    )
    for (const row of result.rows as Record<string, unknown>[]) {
      stock.set(row.variant_id as string, row)
    }
  }
  return {
    items: page.items.map((item) => ({
      productId: item.id,
      publicId: item.publicId,
      title: item.title,
      status: item.status,
      updatedAt: item.updatedAt,
      variants: (variants.get(item.id) ?? []).flatMap((variant) => {
        const row = stock.get(variant.id)
        const onHand = (row?.on_hand as number | undefined) ?? 0
        const reserved = (row?.reserved as number | undefined) ?? 0
        // An archived variant is listed only while it holds stock.
        if (variant.status === 'archived' && onHand === 0 && reserved === 0) return []
        const listed: InventoryListVariant = {
          ...variant,
          onHand,
          reserved,
          version: (row?.version as number | undefined) ?? 1,
          lastMovement: row?.kind
            ? {
                kind: row.kind as MovementKind,
                reasonCode: row.reason_code as string,
                onHandDelta: row.on_hand_delta as number,
                reservedDelta: row.reserved_delta as number,
                createdAt: row.created_at as Date,
              }
            : null,
        }
        return [listed]
      }),
    })),
    last: page.last,
  }
}

// At most this many shop-order numbers in a `below_reserved` item.
export const COMMITTED_SHOP_ORDERS_SHOWN = 20

/*
 * The open reservations of a variant of the shop, split as a
 * `below_reserved` item shows them (docs/05 §8.13, 06 §5.1): units
 * `committed` and the numbers of their shop orders that the vendor can act
 * on (`awaiting_acceptance`, `accepted`; oldest first, at most 20), and
 * units `held` for gateway payments in progress, as a count only, because a
 * vendor never sees an `awaiting_payment` shop order (07 §5.2 rule 0). A
 * shop order appears once: it has one line per variant
 * (`order_items_shop_order_variant_key`) and a line one open reservation
 * (`inventory_reservations_open_item_key`). Read by
 * `inventory_reservations_open_variant_idx`.
 */
export async function reservedSplit(
  client: QueryClientContract,
  shopId: string,
  variantId: string
): Promise<{ committed: number; committedShopOrders: string[]; held: number }> {
  const result = await client.rawQuery(
    `SELECT r.status, r.quantity, so.number, so.status AS shop_order_status
       FROM inventory_reservations r
       JOIN order_items oi ON oi.id = r.order_item_id
       JOIN shop_orders so ON so.id = oi.shop_order_id
      WHERE r.variant_id = ? AND r.shop_id = ? AND r.status IN ('held', 'committed')
      ORDER BY so.created_at, so.id`,
    [variantId, shopId]
  )
  const rows = result.rows as {
    status: string
    quantity: number
    number: string
    shop_order_status: string
  }[]
  const committed = rows.filter((row) => row.status === 'committed')
  const numbers = committed
    .filter((row) => ['awaiting_acceptance', 'accepted'].includes(row.shop_order_status))
    .map((row) => row.number)
  return {
    committed: committed.reduce((sum, row) => sum + row.quantity, 0),
    committedShopOrders: numbers.slice(0, COMMITTED_SHOP_ORDERS_SHOWN),
    held: rows.filter((row) => row.status === 'held').reduce((sum, row) => sum + row.quantity, 0),
  }
}

export type StockMovement = {
  id: string
  kind: MovementKind
  reasonCode: string
  onHandDelta: number
  reservedDelta: number
  note: string | null
  actorUserId: string | null
  requestId: string | null
  createdAt: Date
}

/*
 * A variant's stock and its movement history, newest first, one cursor page
 * at a time (02 J-11 step 4: who changed what, why, and with which request
 * ID; R1-S part 2f-iv-b), read by `inventory_movements_variant_history_idx`.
 * Both are scoped to the shop. The stock is 0 and 0 without a stock row.
 */
export async function variantStockHistory(filters: {
  shopId: string
  variantId: string
  limit: number
  seek: Seek | null
}): Promise<{
  stock: { onHand: number; reserved: number; version: number }
  movements: StockMovement[]
  last: Seek | null
}> {
  const client = db.connection()
  const item: { on_hand: number; reserved: number; version: number } | null = await client
    .from('inventory_items')
    .where({ shop_id: filters.shopId, variant_id: filters.variantId })
    .select('on_hand', 'reserved', 'version')
    .first()
  const query = client
    .from('inventory_movements')
    .where({ shop_id: filters.shopId, variant_id: filters.variantId })
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(filters.limit + 1)
    .select(
      'id',
      'kind',
      'reason_code',
      'on_hand_delta',
      'reserved_delta',
      'note',
      'actor_user_id',
      'request_id',
      'created_at',
      client.raw(
        `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as sort_key`
      )
    )
  if (filters.seek) {
    query.whereRaw('(created_at, id) < (?::timestamptz, ?::uuid)', [
      filters.seek.key,
      filters.seek.id,
    ])
  }
  const rows: Record<string, unknown>[] = await query
  const page = rows.slice(0, filters.limit)
  const last = rows.length > filters.limit ? rows[filters.limit - 1] : null
  return {
    stock: {
      onHand: item?.on_hand ?? 0,
      reserved: item?.reserved ?? 0,
      version: item?.version ?? 1,
    },
    movements: page.map((row) => ({
      id: row.id as string,
      kind: row.kind as MovementKind,
      reasonCode: row.reason_code as string,
      onHandDelta: row.on_hand_delta as number,
      reservedDelta: row.reserved_delta as number,
      note: (row.note as string | null) ?? null,
      actorUserId: (row.actor_user_id as string | null) ?? null,
      requestId: (row.request_id as string | null) ?? null,
      createdAt: row.created_at as Date,
    })),
    last: last ? { key: last.sort_key as string, id: last.id as string } : null,
  }
}
