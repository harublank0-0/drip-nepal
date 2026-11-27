import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import type { MediaKind } from '#modules/media/domain/media_kind'
import type { MediaStatus } from '#modules/media/domain/media_status'

/*
 * The media module's reads (docs/09 §2.2). A media asset is shop-scoped:
 * another shop's asset is null, so the caller answers the 404 of a
 * missing one (T-SEC-001).
 */
export type MediaAssetRow = {
  id: string
  shopId: string
  kind: MediaKind
  status: MediaStatus
  mime: string
  bytes: number
  originalKey: string
  rejectionReason: string | null
  // The public derivatives by width, once the asset is `ready` (docs/04a §7.13).
  derivedKeys: Record<string, string> | null
  createdAt: Date
}

export function mediaAssetRow(row: Record<string, unknown>): MediaAssetRow {
  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    kind: row.kind as MediaKind,
    status: row.status as MediaStatus,
    mime: row.mime as string,
    bytes: row.bytes as number,
    originalKey: row.original_key as string,
    rejectionReason: row.rejection_reason as string | null,
    derivedKeys: (row.derived_keys as Record<string, string> | null) ?? null,
    createdAt: row.created_at as Date,
  }
}

export async function shopMediaAsset(
  client: QueryClientContract,
  shopId: string,
  mediaAssetId: string
): Promise<MediaAssetRow | null> {
  const row = await client
    .from('media_assets')
    .where({ id: mediaAssetId, shop_id: shopId })
    .select('*')
    .first()
  return row ? mediaAssetRow(row) : null
}

// One asset of the shop, for `getMediaUpload` (R1-S part 2g-i); null when the shop has none.
export function mediaUploadOf(shopId: string, mediaAssetId: string) {
  return shopMediaAsset(db.connection(), shopId, mediaAssetId)
}

/*
 * The product images of `shopId` among `ids`, with their status, for
 * `replaceProductMedia`: an ID that is not a product image of this shop is
 * absent, so the caller answers it as a missing one (T-SEC-001 case (c)).
 */
export async function shopProductImages(
  client: QueryClientContract,
  shopId: string,
  ids: string[]
): Promise<Map<string, MediaStatus>> {
  if (ids.length === 0) return new Map()
  const rows: { id: string; status: MediaStatus }[] = await client
    .from('media_assets')
    .where({ shop_id: shopId, kind: 'product_image' })
    .whereIn('id', ids)
    .select('id', 'status')
  return new Map(rows.map((row) => [row.id, row.status]))
}
