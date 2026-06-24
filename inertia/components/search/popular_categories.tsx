import { motion } from 'framer-motion'
import { Link } from '@adonisjs/inertia/react'
import { routes } from '@generated/registry'
import type { CategoryResult } from './types'

type PopularCategoriesProps = {
  categories: CategoryResult[]
}

export function PopularCategories({ categories }: PopularCategoriesProps) {
  return (
    <div>
      <h3 className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Popular Categories
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {categories.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          >
            <Link
              route="men"
              className="group relative block overflow-hidden rounded-xl aspect-[4/3] bg-muted"
              aria-label={`Browse ${cat.name} category`}
            >
              {cat.image && (
                <img
                  src={cat.image}
                  alt={cat.name}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-sm font-semibold text-white">{cat.name}</p>
                <p className="text-xs text-white/60">{cat.productCount} products</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
