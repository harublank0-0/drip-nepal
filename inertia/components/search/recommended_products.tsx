import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import type { ProductResult } from './types'

type RecommendedProductsProps = {
  products: ProductResult[]
}

export function RecommendedProducts({ products }: RecommendedProductsProps) {
  return (
    <div>
      <div className="flex items-center justify-between px-2 py-1.5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Recommended
        </h3>
      </div>
      <div className="mt-1 flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-2 px-2">
        {products.slice(0, 6).map((product, i) => (
          <motion.button
            key={product.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className="flex-shrink-0 w-[140px] text-left group"
          >
            <div className="aspect-[3/4] rounded-xl overflow-hidden bg-muted mb-2">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <p className="text-sm font-medium truncate">{product.name}</p>
            <p className="text-xs text-muted-foreground">{product.storeName}</p>
            <p className="text-sm font-semibold mt-0.5">Rs. {product.price.toLocaleString()}</p>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
