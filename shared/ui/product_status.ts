import { catalogEditable } from './shop_access.js'

/*
 * The product status moves a seller makes (docs/05 §6.10; 06 §13.5
 * `publishProduct`, `unpublishProduct`, `archiveProduct`,
 * `restoreProduct`; R1-S part 2e-ii), and how the seller pages offer them
 * (R1-S part 2f-iii). The server's 409 `allowed_events` reads
 * `PRODUCT_MOVES`, so the buttons a page shows and the moves a refusal
 * names are one list; each operation's own `from` statuses in
 * app/modules/catalog/actions/product_status.ts must agree with it
 * (T-CAT-013 tests those, T-UI-044 this list).
 */
export type ProductMove = 'publish' | 'unpublish' | 'archive' | 'restore'

/*
 * The moves each status allows. A draft is offered `publish` only:
 * archiving needs a product that was live (05 §6.10, AC-FR-CAT-007-2).
 * `pending_review`, `rejected` and `blocked` leave by review, an edit or
 * staff, so they allow none of the four.
 */
export const PRODUCT_MOVES: Readonly<Record<string, readonly ProductMove[]>> = {
  draft: ['publish'],
  published: ['unpublish', 'archive'],
  unpublished: ['publish', 'archive'],
  archived: ['restore'],
}

// The permission each move needs (docs/07 §4.5; 02 J-10 "Permissions").
export const MOVE_PERMISSION: Readonly<
  Record<ProductMove, 'shop.products.publish' | 'shop.products.edit'>
> = {
  publish: 'shop.products.publish',
  unpublish: 'shop.products.publish',
  archive: 'shop.products.edit',
  restore: 'shop.products.edit',
}

/*
 * The moves a page offers for a product in `status`: those the status
 * allows, for which `may` grants the permission, while the shop may change
 * its catalogue (the four's `products_edit` gate: `active` only). The UI
 * hides; the server decides (docs/08 §11.6).
 */
export function productMoves(
  status: string,
  shopStatus: string,
  may: (permission: (typeof MOVE_PERMISSION)[ProductMove]) => boolean
): ProductMove[] {
  if (!catalogEditable(shopStatus)) return []
  return (PRODUCT_MOVES[status] ?? []).filter((move) => may(MOVE_PERMISSION[move]))
}

/*
 * Whether a refused move is a draft that has to be reviewed first: a `pre`
 * review-mode shop or a watch-listed brand answers `publishProduct` with
 * 409 and `allowed_events: [submit]` (AC-J10-07). R1-S builds no review to
 * submit to (FR-CAT-006 waits), so the page says so instead.
 */
export function needsReview(problem: { code: string; allowed_events?: unknown }) {
  return (
    problem.code === 'INVALID_STATE_TRANSITION' &&
    Array.isArray(problem.allowed_events) &&
    problem.allowed_events.includes('submit')
  )
}

/*
 * Where the seller fixes an item of the publication gate's 422 (06 §13.5
 * `publishProduct`), or of `missing_for_submit`: a field of the details
 * form, the variant editor, the photos (R1-S part 2g), or another page.
 * `none` is an item no page fixes yet.
 */
export type GateFix =
  | { kind: 'details'; field: string }
  | { kind: 'variants' }
  | { kind: 'photos' }
  | { kind: 'agreement' }
  | { kind: 'shipping' }
  | { kind: 'none' }

const DETAILS_FIELDS = new Set([
  'description',
  'manufacturer_name',
  'warranty_text',
  'care_and_precautions',
  'country_of_origin',
  'category_id',
  'brand_id',
  'attributes',
])

export function gateFix(field: string): GateFix {
  if (DETAILS_FIELDS.has(field)) return { kind: 'details', field }
  if (field === 'variants' || field === 'option_axes') return { kind: 'variants' }
  if (field === 'media') return { kind: 'photos' }
  if (field === 'agreement') return { kind: 'agreement' }
  if (field === 'shipping') return { kind: 'shipping' }
  return { kind: 'none' }
}

/*
 * The gate gives an attribute's problem on `attributes`, its message
 * prefixed with the attribute's code (`material: This category does not use
 * this attribute.`), since the request sent no attributes to index. The
 * seller reads the attribute's name instead, when `nameOf` knows it.
 */
export function attributeMessage(message: string, nameOf: (code: string) => string | undefined) {
  const match = /^([a-z][a-z0-9_]*): (.+)$/s.exec(message)
  if (!match) return message
  return `${nameOf(match[1]) ?? match[1]}: ${match[2]}`
}
