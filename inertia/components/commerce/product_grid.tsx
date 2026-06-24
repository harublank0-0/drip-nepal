import { motion, AnimatePresence } from 'framer-motion'
import { ProductCard } from '~/components/commerce/product_card'
import type { CategoryProduct } from '~/pages/commerce/categories/mock'

type ProductGridProps = {
  products: CategoryProduct[]
  columns: '2' | '3' | '4'
  onQuickAdd?: (product: CategoryProduct) => void
  onWishlist?: (id: string) => void
}

const colClasses = {
  '2': 'grid-cols-2 lg:grid-cols-2',
  '3': 'grid-cols-2 lg:grid-cols-3',
  '4': 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
}

export function ProductGrid({ products, columns, onQuickAdd, onWishlist }: ProductGridProps) {
  if (products.length === 0) return null

  return (
    <motion.div className={`grid ${colClasses[columns]} gap-4 md:gap-6`} layout>
      <AnimatePresence mode="popLayout">
        {products.map((product, index) => (
          <motion.div
            key={product.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.3, delay: index * 0.03, ease: 'easeOut' }}
          >
            <ProductCard product={product} onQuickAdd={onQuickAdd} onWishlist={onWishlist} />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
