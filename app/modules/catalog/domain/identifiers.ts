import { randomInt } from 'node:crypto'

/*
 * A product's identifiers (docs/04 §2.1, docs/04a §7.6; R1-S part 2a).
 *
 * - `public_id`: 8 Crockford base32 characters (no I, L, O or U), random,
 *   immutable, the product's public URL key (`products_public_id_check`).
 *   32^8 is about 10^12 values, so at the launch catalog size a collision is
 *   rare; the insert retries one in a savepoint (T-CAT-007).
 * - `slug`: cosmetic. The title without accents (decomposed, marks
 *   dropped), lower-cased, every run of other characters one hyphen, at
 *   most 80 characters (`products_slug_check`); `product` when nothing is
 *   left, as for a title in Devanagari only.
 */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const PUBLIC_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/

export function newPublicId(): string {
  let id = ''
  for (let n = 0; n < 8; n++) id += CROCKFORD[randomInt(CROCKFORD.length)]
  return id
}

const SLUG_MAX = 80

export function productSlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '')
  return slug || 'product'
}
