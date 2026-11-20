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
