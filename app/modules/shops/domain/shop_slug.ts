/*
 * The shape of a shop slug, as `shops_slug_check` and
 * `slug_redirects_old_slug_check` hold it (docs/04a §6.1, §6.10), in any
 * case: the columns are citext, so a URL may differ in case. A value of
 * another shape names no shop, so it never reaches a query (a NUL byte
 * would make PostgreSQL refuse the text).
 */
export const SHOP_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/i

export function hasShopSlugShape(value: string) {
  return SHOP_SLUG_PATTERN.test(value)
}

/*
 * The reserved words no shop may take as its slug (docs/04 §2.8,
 * AC-FR-SHOP-001-3; closes IAM-16): the list 04 §2.8 names and the first
 * segment of every page and API route built so far, so a slug never reads
 * like a part of the site. It grows with the routes; a word added later
 * does not rename a shop that already holds it. `p` and `c` are listed as
 * 04 lists them, though the slug pattern already needs 3 characters.
 */
export const RESERVED_SHOP_SLUGS: readonly string[] = [
  'account',
  'admin',
  'api',
  'c',
  'cart',
  'checkout',
  'dev',
  'forgot-password',
  'health',
  'invitations',
  'legal',
  'login',
  'mfa',
  'p',
  'payments',
  'reset-password',
  'search',
  'sell',
  'seller',
  'shops',
  'signup',
  'verify-email',
  'webhooks',
]

export function isReservedShopSlug(value: string) {
  return RESERVED_SHOP_SLUGS.includes(value.toLowerCase())
}
