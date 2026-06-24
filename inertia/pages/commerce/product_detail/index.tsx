import type { InertiaProps } from '~/types'
import { Separator } from '~/components/ui/separator'
import { ProductGallery } from './components/product_gallery'
import { ProductInfo } from './components/product_info'
import { ProductDescription } from './components/product_description'
import { ReviewSection } from './components/review_section'
import { RelatedProducts } from './components/related_products'
import { RecentlyViewed } from './components/recently_viewed'
import { mockProduct } from './mock'

type PageProps = InertiaProps<{}>

export default function Index({}: PageProps) {
  const product = mockProduct

  return (
    <div className="min-h-screen">
      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-20 md:pt-24">
        <div className="flex flex-col lg:flex-row lg:gap-10 xl:gap-16">
          {/* Gallery — 60% on desktop */}
          <div className="w-full lg:w-[60%] lg:flex-shrink-0">
            <ProductGallery images={product.images} />
          </div>

          {/* Product Info — 40% on desktop, sticky */}
          <div className="w-full lg:w-[40%] mt-8 lg:mt-0">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <ProductInfo product={product} />
            </div>
          </div>
        </div>

        <Separator className="my-4 md:my-8" />

        {/* Description tabs */}
        <ProductDescription product={product} />

        <Separator className="my-4 md:my-8" />

        {/* Reviews */}
        <ReviewSection
          reviews={product.reviews}
          rating={product.rating}
          reviewCount={product.reviewCount}
        />

        <Separator className="my-4 md:my-8" />

        {/* Related Products */}
        <RelatedProducts products={product.relatedProducts} />

        {/* Recently Viewed */}
        <RecentlyViewed products={product.relatedProducts.slice(0, 4)} />
      </div>
    </div>
  )
}
