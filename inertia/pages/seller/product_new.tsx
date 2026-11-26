import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import type { AttributeOption, BrandOption, CategoryOption } from '@shared/ui/product_details'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { ProductDetailsForm } from '~/components/seller/product_details_form'

/*
 * `/seller/{shopSlug}/products/new` (docs/08 §2.5 `/products/new` row; 02
 * J-10 steps 1 to 3; R1-S part 2f-i), rendered in the browser in the
 * seller layout, for a role with `shop.products.edit` while the shop is
 * `active` (the page's gate, `createProduct`'s). Its props are the form's
 * choices: the leaf categories with their attribute rules, the attributes
 * with their values, and the brands
 * (app/controllers/seller/catalog/products_controller.ts). "Save draft"
 * creates the draft and opens its editor, where variants, stock and photos
 * follow.
 */
type Props = InertiaProps<{
  categories: CategoryOption[]
  attributes: AttributeOption[]
  brands: BrandOption[]
}>

export default function SellerProductNew({
  categories,
  attributes,
  brands,
  current_shop: current,
}: Props) {
  if (!current) return null
  return (
    <>
      <Head title={t('seller.product_new.page_title', { name: current.name })} />
      <div className="max-w-2xl space-y-6">
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
            className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
          >
            {t('seller.product_new.heading')}
          </h1>
          <p className="text-muted-foreground">{t('seller.product_new.intro')}</p>
        </header>
        <ProductDetailsForm
          shopSlug={current.slug}
          product={null}
          categories={categories}
          attributes={attributes}
          brands={brands}
        />
      </div>
    </>
  )
}
