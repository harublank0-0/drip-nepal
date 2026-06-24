import { motion } from 'framer-motion'
import type { StoreResult } from './types'

type PopularStoresProps = {
  stores: StoreResult[]
}

export function PopularStores({ stores }: PopularStoresProps) {
  return (
    <div>
      <h3 className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Popular Stores
      </h3>
      <div className="mt-2 space-y-1">
        {stores.map((store, i) => (
          <motion.button
            key={store.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
          >
            <img
              src={store.logo}
              alt={store.name}
              className="size-9 rounded-full object-cover ring-1 ring-foreground/10"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{store.name}</p>
              <p className="text-xs text-muted-foreground">{store.productCount} products</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-amber-500"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {store.rating}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
