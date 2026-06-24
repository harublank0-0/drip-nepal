import { motion } from 'framer-motion'
import { DripProductCard } from '~/components/commerce/drip_product_card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/components/ui/carousel'
import type { RelatedProduct } from '../mock'

type RelatedProductsProps = {
  products: RelatedProduct[]
}

export function RelatedProducts({ products }: RelatedProductsProps) {
  return (
    <section aria-label="Related Products" className="py-12 md:py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-2xl md:text-3xl font-heading font-bold mb-2">Complete the Look</h2>
        <p className="text-sm text-muted-foreground mb-8">
          Items that pair perfectly with this piece
        </p>
      </motion.div>

      <Carousel opts={{ align: 'start', loop: false }} className="w-full">
        <CarouselContent>
          {products.map((product) => (
            <CarouselItem
              key={product.id}
              className="basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
                className="h-full"
              >
                <DripProductCard {...product} />
              </motion.div>
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
