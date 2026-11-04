import { Link } from '@adonisjs/inertia/react'
import { motion, type Variants } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import type { Data } from '@generated/data'

type FeaturedStoresProps = {
  stores: Data.StoreCard[]
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const storeCardVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  },
}

function StoreMark({ store }: { store: Data.StoreCard }) {
  if (store.logo) {
    return (
      <img
        src={store.logo}
        alt=""
        className="size-11 md:size-14 rounded-full object-cover ring-1 ring-foreground/10 mb-3 md:mb-4"
      />
    )
  }
  return (
    <div
      aria-hidden="true"
      className="size-11 md:size-14 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center mb-3 md:mb-4"
    >
      <span className="text-primary-foreground font-heading font-bold text-xl">
        {store.name.charAt(0).toUpperCase()}
      </span>
    </div>
  )
}

export function FeaturedStores({ stores }: FeaturedStoresProps) {
  return (
    <section
      aria-labelledby="featured-stores-heading"
      className="py-10 md:py-20 px-5 md:px-8 max-w-7xl mx-auto"
    >
      <motion.div
        className="mb-5 md:mb-8"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
      >
        <h2
          id="featured-stores-heading"
          className="text-2xl md:text-4xl font-heading font-bold tracking-tight"
        >
          Shops on Drip Nepal
        </h2>
      </motion.div>

      <motion.ul
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-100px' }}
      >
        {stores.map((store) => (
          <motion.li
            key={store.id}
            variants={storeCardVariants}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.3 }}
          >
            <Link
              route="stores.show"
              routeParams={{ slug: store.slug }}
              className="group block relative overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 p-5 md:p-8 h-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {store.banner && (
                <img
                  src={store.banner}
                  alt=""
                  className="absolute inset-0 size-full object-cover opacity-10 group-hover:opacity-20 transition-opacity duration-500"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10 flex flex-col h-full">
                <StoreMark store={store} />

                <h3 className="text-lg font-heading font-bold mb-1 group-hover:text-primary transition-colors duration-300">
                  {store.name}
                </h3>
                {store.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {store.description}
                  </p>
                )}

                <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-sm">
                  <span className="text-muted-foreground">
                    {store.productCount} {store.productCount === 1 ? 'product' : 'products'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-primary group-hover:gap-2.5 transition-all duration-300">
                    Visit store <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  )
}
