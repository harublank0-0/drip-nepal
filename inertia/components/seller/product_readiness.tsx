import type { RefObject } from 'react'
import { CircleIcon } from 'lucide-react'
import { Link } from '@adonisjs/inertia/react'
import type { SellerProduct } from '@shared/ui/product_details'
import { attributeMessage, gateFix } from '@shared/ui/product_status'
import { t } from '~/lib/i18n'
import { detailsFieldId } from '~/components/seller/product_details_form'

/*
 * "Before this product can go live" (docs/08 §3.1 "Products list, new,
 * edit": the `missing_for_submit` list; 01 AC-FR-CAT-005-2; R1-S parts
 * 2f-i and 2f-iii): what still blocks publishing, each as a plain sentence.
 * Before a publish, the items are `missing_for_submit` (the product's own
 * gaps, from the same pure function as the server's refusal, T-CAT-002),
 * shown on a draft or rejected product. After a refused publish, they are
 * the gate's 422 items, which add the shop's conditions (an accepted
 * agreement, shipping) and the category's rules (attributes, axes), shown
 * whatever the status until the next move or reload.
 *
 * Each item links to where it is fixed when that is on this page and the
 * forms are offered (`editable`): a field of the details form, the
 * variants; the agreement links to the overview and shipping to the
 * shipping page. Photos come with R1-S part 2g, so that item is text only.
 */
export type ReadinessItem = { field: string; code?: string; message?: string }

const ITEMS: Record<string, Parameters<typeof t>[0]> = {
  variants: 'seller.product.missing.variants',
  media: 'seller.product.missing.media',
  description: 'seller.product.missing.description',
  manufacturer_name: 'seller.product.missing.manufacturer_name',
  warranty_text: 'seller.product.missing.warranty_text',
  care_and_precautions: 'seller.product.missing.care_and_precautions',
  country_of_origin: 'seller.product.missing.country_of_origin',
  agreement: 'seller.product.missing.agreement',
  shipping: 'seller.product.missing.shipping',
}

const SHOWN_FOR = new Set(['draft', 'rejected'])

// The variant editor's own targets (product_variants_form.tsx, product_edit.tsx).
const VARIANTS_HEADING_ID = 'product-variants-heading'
const AXES_ID = 'variants-axes'

function textOf(item: ReadinessItem, nameOf: (code: string) => string | undefined) {
  // A missing item reads as the catalogue says it; a failed rule as the server explains it.
  if ((item.code === undefined || item.code === 'required') && ITEMS[item.field]) {
    return t(ITEMS[item.field])
  }
  if (item.field === 'attributes' && item.message) return attributeMessage(item.message, nameOf)
  return item.message ?? item.field
}

// Moves focus to a field of this page; the hash gives the link a real target and a URL to copy.
function focusTarget(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({ block: 'center' })
  target.focus({ preventScroll: true })
}

function ItemText({
  item,
  editable,
  shopSlug,
  nameOf,
}: {
  item: ReadinessItem
  editable: boolean
  shopSlug: string
  nameOf: (code: string) => string | undefined
}) {
  const text = textOf(item, nameOf)
  const fix = gateFix(item.field)
  const linkClass = 'text-link underline-offset-4 hover:underline'
  if (fix.kind === 'agreement' || fix.kind === 'shipping') {
    return (
      <Link
        route={fix.kind === 'agreement' ? 'seller.overview' : 'seller.shipping'}
        routeParams={{ shopSlug }}
        className={linkClass}
      >
        {text}
      </Link>
    )
  }
  if (!editable || (fix.kind !== 'details' && fix.kind !== 'variants')) return <span>{text}</span>
  const id =
    fix.kind === 'details'
      ? detailsFieldId(fix.field)
      : item.field === 'option_axes'
        ? AXES_ID
        : VARIANTS_HEADING_ID
  return (
    <a
      href={`#${id}`}
      className={linkClass}
      onClick={(event) => {
        event.preventDefault()
        focusTarget(id)
      }}
    >
      {text}
    </a>
  )
}

// The items as a list; the product list shows a refused publish's items with it.
export function ReadinessItems({
  items,
  editable,
  shopSlug,
  nameOf,
}: {
  items: readonly ReadinessItem[]
  editable: boolean
  shopSlug: string
  nameOf: (code: string) => string | undefined
}) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item.field}-${index}`} className="flex items-start gap-2">
          <CircleIcon aria-hidden="true" className="text-muted-foreground mt-1 size-3 shrink-0" />
          <ItemText item={item} editable={editable} shopSlug={shopSlug} nameOf={nameOf} />
        </li>
      ))}
    </ul>
  )
}

export function ProductReadiness({
  product,
  refused,
  editable,
  shopSlug,
  nameOf,
  headingRef,
}: {
  product: SellerProduct
  // The items of a refused publish, or null.
  refused: ReadinessItem[] | null
  editable: boolean
  shopSlug: string
  nameOf: (code: string) => string | undefined
  headingRef?: RefObject<HTMLHeadingElement | null>
}) {
  const items = refused ?? product.missing_for_submit.map((field) => ({ field }))
  if (items.length === 0 || (refused === null && !SHOWN_FOR.has(product.status))) return null
  return (
    <section aria-labelledby="product-readiness-heading" className="space-y-3">
      <h2
        id="product-readiness-heading"
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-xl font-semibold tracking-tight outline-none"
      >
        {t('seller.product.missing.heading')}
      </h2>
      {refused && <p>{t('seller.product.missing.refused')}</p>}
      <ReadinessItems items={items} editable={editable} shopSlug={shopSlug} nameOf={nameOf} />
    </section>
  )
}
