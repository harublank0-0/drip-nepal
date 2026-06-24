import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/components/ui/carousel'
import { ProductCard } from '~/components/commerce/product_card'
import type { CategoryProduct } from '../mock'

type RecentlyViewedProps = {
  products: CategoryProduct[]
}

export function RecentlyViewed({ products }: RecentlyViewedProps) {
  if (products.length === 0) return null

  return (
    <section className="mt-16">
      <h2 className="text-xl md:text-2xl font-heading font-semibold mb-6">Recently Viewed</h2>
      <Carousel
        opts={{
          align: 'start',
          containScroll: 'trimSnaps',
        }}
      >
        <CarouselContent className="-ml-4">
          {products.map((product) => (
            <CarouselItem
              key={product.id}
              className="pl-4 basis-1/2 md:basis-1/3 lg:basis-1/4 xl:basis-1/5"
            >
              <ProductCard product={product} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="hidden md:flex" />
        <CarouselNext className="hidden md:flex" />
      </Carousel>
    </section>
  )
}
