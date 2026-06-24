import { motion } from 'framer-motion'
import { Store, Package, Users } from 'lucide-react'
import { Button } from '~/components/ui/button'
import type { ProductStore } from '../mock'

type StoreCardProps = {
  store: ProductStore
}

export function StoreCard({ store }: StoreCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl overflow-hidden ring-1 ring-foreground/10 bg-card"
    >
      <div
        className="h-20 bg-cover bg-center"
        style={{ backgroundImage: `url(${store.banner})` }}
        role="img"
        aria-label={`${store.name} banner`}
      />

      <div className="px-5 pb-5 -mt-8">
        <div className="size-16 rounded-full ring-4 ring-background overflow-hidden mb-3 bg-muted">
          <img src={store.logo} alt={`${store.name} logo`} className="w-full h-full object-cover" />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-heading font-bold text-base">{store.name}</h3>
            <div className="flex items-center gap-1 mt-0.5">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1"
                className="text-amber-500"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="text-sm font-medium">{store.rating}</span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="cursor-pointer">
            Visit Store
          </Button>
        </div>

        <div className="flex gap-5 mt-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Package className="size-3.5" />
            {store.totalProducts} products
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" />
            {(store.totalFollowers / 1000).toFixed(1)}K followers
          </span>
        </div>
      </div>
    </motion.div>
  )
}
