import db from '@adonisjs/lucid/services/db'
import type { ShopMemberRole } from '#modules/shops/domain/shop_member_role'
import { hasShopSlugShape } from '#modules/shops/domain/shop_slug'

/*
 * The shops module's reads for other layers (docs/09 §2.2: a module's
 * public surface is `actions/`, `queries.ts` and `events.ts`).
 */

export type SellerActor = 'owner' | ShopMemberRole

export type SellerContext = {
  id: string
  slug: string
  name: string
  status: string
  suspensionMode: string | null
  actor: SellerActor
  // The request named a retired slug (docs/04a §6.10), not a case variant.
  viaRedirect: boolean
}

type SellerContextRow = {
  id: string
  slug: string
  name: string
  status: string
  suspension_mode: string | null
  actor: SellerActor
  via_redirect: boolean
}

/*
 * Steps 1 and 2 of the seller authorization algorithm (docs/06 §4.4,
 * docs/09 §12.4): the shop `slug` names, by its current slug or a retired
 * one in `slug_redirects`, and the caller's place in it: its owner, or an
 * `active` member with that member's role. Null when the slug names no shop
 * or the caller is neither, so the two answer the same 404 (T-SEC-001).
 * `shops.slug` and `slug_redirects.old_slug` are citext, so a case variant
 * matches without counting as a redirect. One round trip on
 * `shops_slug_key`, `slug_redirects_pkey` and
 * `shop_memberships_shop_user_key` (T-SHOP-001). A value that is not
 * shaped like a slug is answered without a query.
 */
export async function resolveSellerContext(
  slug: string,
  userId: string
): Promise<SellerContext | null> {
  if (!hasShopSlugShape(slug)) return null
  const result = await db.rawQuery<{ rows: SellerContextRow[] }>(
    `SELECT s.id, s.slug, s.name, s.status, s.suspension_mode,
            CASE WHEN s.owner_user_id = :user THEN 'owner' ELSE m.role END AS actor,
            (s.slug <> :slug) AS via_redirect
       FROM shops s
       LEFT JOIN shop_memberships m
              ON m.shop_id = s.id AND m.user_id = :user AND m.status = 'active'
      WHERE s.id = COALESCE(
              (SELECT id FROM shops WHERE slug = :slug),
              (SELECT entity_id FROM slug_redirects
                WHERE entity_type = 'shop' AND old_slug = :slug))
        AND (s.owner_user_id = :user OR m.id IS NOT NULL)`,
    { slug, user: userId }
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    suspensionMode: row.suspension_mode,
    actor: row.actor,
    viaRedirect: row.via_redirect,
  }
}

export type ShopLabel = { id: string; slug: string; name: string }

/*
 * The slug and name of each shop in `ids`, for pages that show other
 * modules' rows by shop (the admin courier accounts, docs/08 §3.1). An ID
 * with no shop is left out.
 */
export async function shopLabels(ids: readonly string[]): Promise<Map<string, ShopLabel>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .from('shops')
    .whereIn('id', [...new Set(ids)])
    .select('id', 'slug', 'name')
  return new Map(rows.map((row) => [row.id, { id: row.id, slug: row.slug, name: row.name }]))
}
