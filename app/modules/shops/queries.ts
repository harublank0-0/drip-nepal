import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { InvariantViolation } from '#exceptions/programming_errors'
import type { ShopMemberRole } from '#modules/shops/domain/shop_member_role'
import { hasShopSlugShape } from '#modules/shops/domain/shop_slug'
import { CURRENT_SELLER_AGREEMENT } from '#modules/shops/domain/seller_agreements'
import { shopShipping, type ShopShippingView } from '#modules/logistics/queries'
import { settingIn } from '#modules/platform/settings'

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

export type UserShop = { slug: string; name: string; status: string; role: SellerActor }

/*
 * The shops a user owns and those they are an `active` member of, for the
 * user's own `getMe` (docs/06 §13.3, "owned and member shops"),
 * `listMyShops` (§13.5) and the `seller_shops` shared prop (docs/03 §6.3):
 * each shop's slug, name and status, and the user's place in it, by name.
 * Shop IDs and other members are never part of it. At most
 * `MY_SHOPS_LIMIT` rows, the first by name, so the list is bounded
 * (06 §6.2 "Bounded lists") on every page that sends it. One round trip on
 * `shops_owner_idx` and `shop_memberships_user_active_idx`.
 */
export const MY_SHOPS_LIMIT = 20 // [Assumption A-63]

export async function shopsOfUser(userId: string): Promise<UserShop[]> {
  const result = await db.rawQuery(
    `SELECT s.slug, s.name, s.status, 'owner' AS role
       FROM shops s
      WHERE s.owner_user_id = :user
     UNION ALL
     SELECT s.slug, s.name, s.status, m.role
       FROM shop_memberships m
       JOIN shops s ON s.id = m.shop_id
      WHERE m.user_id = :user AND m.status = 'active'
     ORDER BY name, slug
     LIMIT :limit`,
    { user: userId, limit: MY_SHOPS_LIMIT }
  )
  return (result.rows as UserShop[]).map((row) => ({
    slug: row.slug,
    name: row.name,
    status: row.status,
    role: row.role,
  }))
}

/*
 * A shop as `getSellerShop` and the seller pages read it (docs/06 §13.5):
 * the profile columns of docs/04a §6.1, the status, the `version` of its
 * ETag, and whether the shop holds an agreement row for the current seller
 * agreement version (04a §6.4). The grievance phone stays ciphertext: only
 * the shop profile transformer decrypts it, for the owner (docs/07 §5.5,
 * T-SEC-034). Null for a missing shop.
 */
export type SellerShopRow = {
  id: string
  slug: string
  name: string
  status: string
  suspension_mode: string | null
  description: string | null
  contact_email: string
  contact_phone_e164: string
  return_policy_text: string
  business_type: string
  business_registration_number: string | null
  business_registration_authority: string | null
  pan_vat_number: string | null
  is_vat_registered: boolean
  grievance_contact_name: string | null
  grievance_contact_phone_enc: string | null
  version: number
  agreement_version: string
  agreement_is_final: boolean
  agreement_accepted: boolean
}

export async function sellerShop(
  shopId: string,
  options: { client?: QueryClientContract } = {}
): Promise<SellerShopRow | null> {
  // Inside `updateShopProfile`'s transaction, so the answer is the row it has locked.
  const client: QueryClientContract = options.client ?? db.connection()
  const result = await client.rawQuery(
    `SELECT s.id, s.slug, s.name, s.status, s.suspension_mode, s.description,
            s.contact_email, s.contact_phone_e164, s.return_policy_text, s.business_type,
            s.business_registration_number, s.business_registration_authority,
            s.pan_vat_number, s.is_vat_registered, s.grievance_contact_name,
            s.grievance_contact_phone_enc, s.version,
            EXISTS (SELECT 1 FROM shop_agreements a
                     WHERE a.shop_id = s.id AND a.agreement_version = :agreement)
              AS agreement_accepted
       FROM shops s
      WHERE s.id = :shop`,
    { shop: shopId, agreement: CURRENT_SELLER_AGREEMENT.version }
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    ...row,
    agreement_version: CURRENT_SELLER_AGREEMENT.version,
    agreement_is_final: CURRENT_SELLER_AGREEMENT.isFinal,
  } as SellerShopRow
}

/*
 * Whether the shop has a default pickup address that is not archived
 * (docs/04a §6.6), the address approval and courier booking need; for the
 * overview's "before you can sell" list (docs/08 §2.5).
 */
export async function hasDefaultPickupAddress(shopId: string) {
  const row = await db
    .from('shop_addresses')
    .where({ shop_id: shopId, purpose: 'pickup', is_default: true })
    .whereNull('archived_at')
    .select('id')
    .first()
  return row !== null
}

/*
 * Whether the shop holds an agreement row for the current seller agreement
 * version (docs/04a §6.4): the overview's "before you can sell" item, read
 * alone so the page reads no profile column it does not show.
 */
export async function acceptedCurrentAgreement(shopId: string) {
  const row = await db
    .from('shop_agreements')
    .where({ shop_id: shopId, agreement_version: CURRENT_SELLER_AGREEMENT.version })
    .select('id')
    .first()
  return row !== null
}

/*
 * Whether a user owns a shop in any status, for `platform:create-shop` to
 * refuse before it asks anything (docs/09 §9.8). Its action checks again
 * under its locks.
 */
export async function ownsAnyShop(userId: string) {
  const row = await db.from('shops').where('owner_user_id', userId).select('id').first()
  return row !== null
}

/*
 * Which of `shopIds` the user owns or works in (an `active` membership),
 * in any shop status: OD-44's "their own shop" (docs/07 §4.1 item 4,
 * `ownShopCheck`). Read in the caller's transaction, without a lock: a
 * membership that changes during one admin action is not a race this check
 * has to win.
 */
export async function shopsWorkedIn(
  client: QueryClientContract,
  userId: string,
  shopIds: readonly string[]
): Promise<string[]> {
  if (shopIds.length === 0) return []
  const rows: { id: string }[] = await client
    .from('shops')
    .whereIn('id', [...shopIds])
    .where((query) => {
      query.where('owner_user_id', userId).orWhereExists((member) => {
        member
          .from('shop_memberships')
          .whereColumn('shop_memberships.shop_id', 'shops.id')
          .where('shop_memberships.user_id', userId)
          .where('shop_memberships.status', 'active')
      })
    })
    .select('id')
  return rows.map((row) => row.id)
}

/*
 * For the admin pages (R1-S part 1c-ii): which of `shopIds` an action by
 * this staff member would need a `totp_code` for, so a dialog asks for the
 * code with the first send (OD-44's exception, `ownShopCheck`): their own
 * shops while `single_operator_mode` is on, none while it is off (the
 * action then answers 403, which the dialog shows). The action checks again
 * in its transaction.
 */
export async function shopsNeedingCode(
  userId: string,
  shopIds: readonly string[]
): Promise<Set<string>> {
  const client = db.connection()
  const own = await shopsWorkedIn(client, userId, shopIds)
  if (own.length === 0) return new Set()
  const mode = await settingIn(client, 'single_operator_mode', false)
  return new Set(mode === true ? own : [])
}

/*
 * A shop's delivery configuration with the `version` of its ETag, as
 * `getShopShipping` answers it (docs/06 §13.5, §8; R1-S part 1c): the
 * coverage and rates are `logistics` rows (04a §9.6, §9.7), the version is
 * `shops.version`, which `replaceShopShipping` takes as `If-Match`. The
 * version is read first: a save that commits between the two reads then
 * leaves the version older than the rows, never newer, so a form built from
 * this answer gets 412 instead of overwriting the newer rows unseen. Inside
 * `replaceShopShipping`'s transaction (`client`) the shop row is locked and
 * the pair is exact.
 */
export type ShopShippingState = ShopShippingView & { version: number }

export async function shopShippingState(
  shopId: string,
  options: { client?: QueryClientContract } = {}
): Promise<ShopShippingState> {
  const client: QueryClientContract = options.client ?? db.connection()
  const shop: { version: number } | null = await client
    .from('shops')
    .where('id', shopId)
    .select('version')
    .first()
  // Callers pass the shop `seller_context` has just found; shops are never deleted while members remain.
  if (!shop) throw new InvariantViolation('the shop of a seller route was not found')
  const shipping = await shopShipping(shopId, { client })
  return { ...shipping, version: shop.version }
}
