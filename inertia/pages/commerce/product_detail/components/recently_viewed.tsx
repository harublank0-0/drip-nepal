import { motion } from 'framer-motion'
import { DripProductCard } from '~/components/commerce/drip_product_card'
import type { RelatedProduct } from '../mock'

type RecentlyViewedProps = {
  products: RelatedProduct[]
}

export function RecentlyViewed({ products }: RecentlyViewedProps) {
  return (
    <section aria-label="Recently viewed products" className="py-12 md:py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-2xl md:text-3xl font-heading font-bold mb-8">Recently Viewed</h2>
      </motion.div>

      <div className="overflow-x-auto pb-4 scrollbar-none">
        <div className="flex gap-4 min-w-max">
          {products.map((product) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="w-[260px] sm:w-[280px]"
            >
              <DripProductCard {...product} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
