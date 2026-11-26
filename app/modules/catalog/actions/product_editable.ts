import { InvalidStateTransition } from '#exceptions/domain_error'
import type { ProductRow } from '#modules/catalog/queries'

/*
 * Whether the shop may edit a product (docs/05 §6.10): not while it is
 * `pending_review`, `archived` or `blocked`, which answer 409
 * `INVALID_STATE_TRANSITION`, with `restore` offered for an archived one.
 * `updateProduct`, `replaceProductVariants` and `replaceProductMedia` all
 * apply it, to the product they have locked.
 */
const EDITABLE = new Set(['draft', 'rejected', 'published', 'unpublished'])

export function assertProductEditable(product: ProductRow) {
  if (!EDITABLE.has(product.status)) {
    throw new InvalidStateTransition(
      product.status,
      product.status === 'archived' ? ['restore'] : []
    )
  }
}
