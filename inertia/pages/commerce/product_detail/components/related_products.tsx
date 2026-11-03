import type { Data } from '@generated/data'
import { CatalogProductCard } from '~/components/commerce/catalog_product_card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/components/ui/carousel'

type RelatedProductsProps = {
  products: Data.ProductCard[]
  categoryName?: string
}

export function RelatedProducts({ products, categoryName }: RelatedProductsProps) {
  if (products.length === 0) return null

  return (
    <section aria-labelledby="related-products-heading" className="py-10 md:py-14">
      <Carousel opts={{ align: 'start' }} className="w-full">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 id="related-products-heading" className="font-heading text-xl font-bold md:text-2xl">
            {categoryName ? `More in ${categoryName}` : 'You may also like'}
          </h2>
          {products.length > 2 && (
            <div className="hidden gap-2 md:flex">
              <CarouselPrevious className="static translate-y-0" />
              <CarouselNext className="static translate-y-0" />
            </div>
          )}
        </div>

        <CarouselContent>
          {products.map((product) => (
            <CarouselItem key={product.id} className="basis-1/2 sm:basis-1/3 lg:basis-1/4">
              <CatalogProductCard product={product} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  )
}
