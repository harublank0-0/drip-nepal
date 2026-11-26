import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import {
  productEditable,
  type AttributeOption,
  type BrandOption,
  type CategoryOption,
  type SellerProduct,
} from '@shared/ui/product_details'
import { catalogEditable } from '@shared/ui/shop_access'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { can } from '~/lib/permissions'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { StatusBadge } from '~/components/common/status_badge'
import { ProductDetailsForm } from '~/components/seller/product_details_form'
import { ProductDetailsView } from '~/components/seller/product_details_view'
import { ProductReadiness } from '~/components/seller/product_readiness'
import { ProductVariantsSummary } from '~/components/seller/product_variants_summary'

/*
 * `/seller/{shopSlug}/products/{productId}` (docs/08 §2.5
 * `/products/{productId}` row; 02 J-10; R1-S part 2f-i), rendered in the
 * browser in the seller layout. Its props are the product as
 * `getShopProduct` answers it (`product`) and the form's choices
 * (app/controllers/seller/catalog/products_controller.ts).
 *
 * The header names the product, its status and its public ID. A rejected
 * product shows the moderator's reason (saving a change returns it to
 * draft, AC-FR-CAT-006-2). "Before this product can go live" lists what
 * `missing_for_submit` still names. The details are a form for a role with
 * `shop.products.edit`, in a shop that may change its catalogue
 * (`catalogEditable`), on a product that may be edited (`productEditable`):
 * the server's own rules. Anyone else reads the saved details, with a line
 * saying why they cannot be changed. The variants follow, as saved. The UI
 * hides; the server decides (docs/08 §11.6).
 */
type Props = InertiaProps<{
  product: SellerProduct
  categories: CategoryOption[]
  attributes: AttributeOption[]
  brands: BrandOption[]
}>

// Why the details are read-only, or null when the form is offered.
function readOnlyReason(
  product: SellerProduct,
  current: NonNullable<Props['current_shop']>
): string | null {
  if (!can(current, 'shop.products.edit')) return t('seller.product.read_only_role')
  if (!catalogEditable(current.status)) return t('seller.product.read_only_shop')
  if (!productEditable(product.status)) {
    if (product.status === 'pending_review') return t('seller.product.read_only_review')
    if (product.status === 'archived') return t('seller.product.read_only_archived')
    return t('seller.product.read_only_blocked')
  }
  return null
}

export default function SellerProductEdit({
  product,
  categories,
  attributes,
  brands,
  current_shop: current,
}: Props) {
  if (!current) return null
  const reason = readOnlyReason(product, current)
  return (
    <>
      <Head title={t('seller.product.page_title', { title: product.title, name: current.name })} />
      <div className="max-w-3xl space-y-8">
        <div className="space-y-4">
          <Link
            route="seller.products"
            routeParams={{ shopSlug: current.slug }}
            className="text-link text-sm underline-offset-4 hover:underline"
          >
            {t('seller.product.back')}
          </Link>
          <header className="space-y-2">
            <h1
              tabIndex={-1}
              className="font-heading text-2xl font-semibold tracking-tight break-words outline-none md:text-3xl"
            >
              {product.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <StatusBadge entity="product" state={product.status} />
              <span className="text-muted-foreground">
                {t('seller.product.public_id', { id: product.public_id })}
              </span>
            </div>
          </header>
          {product.status === 'rejected' && (
            <Alert role="status">
              <AlertTitle>{t('seller.product.rejected_title')}</AlertTitle>
              <AlertDescription>
                <p className="whitespace-pre-line">
                  {product.rejection_reason ?? t('seller.product.rejected_no_reason')}
                </p>
                <p>{t('seller.product.rejected_help')}</p>
              </AlertDescription>
            </Alert>
          )}
          {reason && (
            <Alert role="status">
              <AlertDescription>{reason}</AlertDescription>
            </Alert>
          )}
        </div>

        <ProductReadiness product={product} />

        <section aria-labelledby="product-details-heading" className="space-y-4">
          <h2
            id="product-details-heading"
            className="font-heading text-xl font-semibold tracking-tight"
          >
            {t('seller.product.details_heading')}
          </h2>
          {reason ? (
            <ProductDetailsView product={product} categories={categories} attributes={attributes} />
          ) : (
            <ProductDetailsForm
              shopSlug={current.slug}
              product={product}
              categories={categories}
              attributes={attributes}
              brands={brands}
            />
          )}
        </section>

        <section aria-labelledby="product-variants-heading" className="space-y-4">
          <div className="space-y-1">
            <h2
              id="product-variants-heading"
              className="font-heading text-xl font-semibold tracking-tight"
            >
              {t('seller.product.variants.heading')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('seller.product.variants.intro')}</p>
          </div>
          <ProductVariantsSummary variants={product.variants} />
        </section>
      </div>
    </>
  )
}
