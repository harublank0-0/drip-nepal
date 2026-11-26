import { InvalidStateTransition } from '#exceptions/domain_error'
import type { ProductRow } from '#modules/catalog/queries'
import { productEditable } from '#shared/ui/product_details'

/*
 * Whether the shop may edit a product (docs/05 §6.10): not while it is
 * `pending_review`, `archived` or `blocked`, which answer 409
 * `INVALID_STATE_TRANSITION`, with `restore` offered for an archived one.
 * `updateProduct`, `replaceProductVariants` and `replaceProductMedia` all
 * apply it, to the product they have locked. The rule is
 * `productEditable`, which the seller editor shares to show the form or
 * the saved details (R1-S part 2f-i).
 */
export function assertProductEditable(product: ProductRow) {
  if (!productEditable(product.status)) {
    throw new InvalidStateTransition(
      product.status,
      product.status === 'archived' ? ['restore'] : []
    )
  }
}
