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

// A product page's path segment is the slug, a hyphen and the ID; the ID alone is allowed too.
const SEGMENT_MAX = 100
// Crockford base32 reads O as 0 and I and L as 1 (ADR-0017 decision 1).
const ALIASES: Record<string, string> = { O: '0', I: '1', L: '1' }

/*
 * The public ID in a product page's path segment `{slug}-{publicId}`
 * (docs/adr/0017-product-urls-public-id.md decision 1; R1-S part 3d-ii):
 * the 8 characters after the last hyphen, in any case, with Crockford's
 * aliases mapped. Null for a segment that holds none, or one over 100
 * characters, which the page answers with 404.
 */
export function publicIdFromPath(segment: string): string | null {
  if (segment.length > SEGMENT_MAX) return null
  const id = segment
    .slice(segment.lastIndexOf('-') + 1)
    .toUpperCase()
    .replaceAll(/[OIL]/g, (letter) => ALIASES[letter])
  return PUBLIC_ID_PATTERN.test(id) ? id : null
}

// The storefront product page's path: the current slug and the lowercase public ID (ADR-0017).
export function productPath(slug: string, publicId: string) {
  return `/p/${slug}-${publicId.toLowerCase()}`
}
