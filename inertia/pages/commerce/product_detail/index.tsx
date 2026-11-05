import { useRef } from 'react'
import { Head } from '@inertiajs/react'
import type { Data } from '@generated/data'
import type { InertiaProps } from '~/types'
import CustomersLayout from '~/layouts/customers_layout'
import RootLayout from '~/layouts/root_layout'
import { Separator } from '~/components/ui/separator'
import { SocialMeta } from '~/components/seo/social_meta'
import { MobileAddToCartBar } from './components/mobile_add_to_cart_bar'
import { ProductDescription } from './components/product_description'
import { ProductGallery } from './components/product_gallery'
import { ProductInfo } from './components/product_info'
import { RelatedProducts } from './components/related_products'
import { useAddToCart } from './hooks/use_add_to_cart'
import { useVariantSelection, type VariantOption } from './hooks/use_variant_selection'

type PageProps = InertiaProps<{
  product: Data.Product
  related: Data.ProductCard[]
}>

function lowestPrice(product: Data.Product) {
  const prices = (product.variants ?? []).map((variant) => variant.priceMinor)
  return prices.length > 0 ? Math.min(...prices) : undefined
}

export default function ProductDetailPage({ product, related }: PageProps) {
  const selection = useVariantSelection(product.variants)
  const cart = useAddToCart()
  const ctaRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const onSelect = (option: VariantOption, value: string) => {
    cart.dismissError()
    selection.select(option, value)
  }

  const onQuantityChange = (quantity: number) => {
    cart.dismissError()
    selection.changeQuantity(quantity)
  }

  const onAddToCart = () => {
    if (selection.state !== 'ready' || !selection.selectedVariant) return
    cart.addToCart(selection.selectedVariant.id, selection.quantity)
  }

  return (
    <>
      <Head title={product.name} />
      <SocialMeta
        type="product"
        title={product.name}
        description={
          product.description ||
          `${product.name} from ${product.shop?.name ?? 'Drip Nepal'}. Cash on delivery across Nepal.`
        }
        image={product.media?.[0]?.url}
        priceMinor={lowestPrice(product)}
      />

      <div className="mx-auto max-w-7xl px-4 pt-6 pb-8 md:px-8 md:pt-10 md:pb-16">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12 xl:gap-16">
          <div className="w-full lg:w-[58%] lg:shrink-0">
            <ProductGallery media={product.media} productName={product.name} />
          </div>

          <div className="w-full min-w-0 lg:sticky lg:top-24 lg:flex-1">
            <ProductInfo
              product={product}
              selection={selection}
              onSelect={onSelect}
              onQuantityChange={onQuantityChange}
              onAddToCart={onAddToCart}
              processing={cart.processing}
              error={cart.error}
              ctaRef={ctaRef}
            />
          </div>
        </div>

        <Separator className="mt-10 md:mt-14" />
        <ProductDescription product={product} selectedVariant={selection.selectedVariant} />

        {related.length > 0 && (
          <>
            <Separator />
            <RelatedProducts products={related} categoryName={product.category?.name} />
          </>
        )}

        <div ref={endRef} aria-hidden="true" />
      </div>

      <MobileAddToCartBar
        selection={selection}
        processing={cart.processing}
        onAddToCart={onAddToCart}
        ctaRef={ctaRef}
        endRef={endRef}
      />
    </>
  )
}

ProductDetailPage.layout = [RootLayout, CustomersLayout]
