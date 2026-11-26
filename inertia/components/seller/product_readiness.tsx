import { CircleIcon } from 'lucide-react'
import type { SellerProduct } from '@shared/ui/product_details'
import { t } from '~/lib/i18n'

/*
 * "Before this product can go live" (docs/08 §3.1 "Products list, new,
 * edit": the `missing_for_submit` list; 01 AC-FR-CAT-005-2; R1-S part
 * 2f-i): what still blocks submitting or publishing, from the same pure
 * function as the server's refusal (T-CAT-002), each as a plain sentence.
 * Shown while the list names anything, on a product that is not live,
 * under review, archived or blocked. The shop's own conditions (an accepted
 * agreement, shipping set) are on the overview's checklist.
 */
const ITEMS: Record<string, Parameters<typeof t>[0]> = {
  variants: 'seller.product.missing.variants',
  media: 'seller.product.missing.media',
  description: 'seller.product.missing.description',
  manufacturer_name: 'seller.product.missing.manufacturer_name',
  warranty_text: 'seller.product.missing.warranty_text',
  care_and_precautions: 'seller.product.missing.care_and_precautions',
  country_of_origin: 'seller.product.missing.country_of_origin',
}

const SHOWN_FOR = new Set(['draft', 'rejected'])

export function ProductReadiness({ product }: { product: SellerProduct }) {
  if (!SHOWN_FOR.has(product.status) || product.missing_for_submit.length === 0) return null
  return (
    <section aria-labelledby="product-readiness-heading" className="space-y-3">
      <h2
        id="product-readiness-heading"
        className="font-heading text-xl font-semibold tracking-tight"
      >
        {t('seller.product.missing.heading')}
      </h2>
      <ul className="space-y-2">
        {product.missing_for_submit.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CircleIcon aria-hidden="true" className="text-muted-foreground mt-1 size-3 shrink-0" />
            <span>{ITEMS[item] ? t(ITEMS[item]) : item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
