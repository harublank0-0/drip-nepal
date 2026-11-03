import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link } from '@adonisjs/inertia/react'
import type { Data } from '@generated/data'
import { Button } from '~/components/ui/button'
import { CatalogProductCard } from '~/components/commerce/catalog_product_card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/components/ui/carousel'

type FeaturedProductsProps = {
  products: Data.ProductCard[]
}

export function FeaturedProducts({ products }: FeaturedProductsProps) {
  return (
    <section
      aria-labelledby="new-arrivals-heading"
      className="py-16 md:py-24 px-6 md:px-8 max-w-7xl mx-auto"
    >
      <motion.div
        className="flex items-end justify-between gap-4 mb-10"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
      >
        <div>
          <h2
            id="new-arrivals-heading"
            className="text-3xl md:text-4xl font-heading font-bold tracking-tight"
          >
            New Arrivals
          </h2>
          <p className="text-muted-foreground text-sm mt-2">
            The latest pieces from shops across Nepal
          </p>
        </div>
        <Button variant="ghost" className="gap-2" asChild>
          <Link route="search">
            Shop all <ArrowRight className="size-4" />
          </Link>
        </Button>
      </motion.div>

      <Carousel opts={{ align: 'start' }} className="w-full">
        <CarouselContent>
          {products.map((product) => (
            <CarouselItem key={product.id} className="basis-1/2 md:basis-1/3 xl:basis-1/4">
              <CatalogProductCard product={product} className="h-full" />
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="hidden md:block">
          <CarouselPrevious />
          <CarouselNext />
        </div>
      </Carousel>
    </section>
  )
}
