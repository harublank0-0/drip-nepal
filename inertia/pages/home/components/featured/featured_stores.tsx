import { Link } from '@adonisjs/inertia/react'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '~/components/ui/button'

const stores = [
  {
    name: 'NikeLab',
    description: 'Innovation in sport and street',
    color: 'from-red-600 to-orange-500',
    href: '#',
  },
  {
    name: 'Kith',
    description: 'Premium lifestyle and apparel',
    color: 'from-blue-600 to-cyan-500',
    href: '#',
  },
  {
    name: 'Aimé Leon Dore',
    description: 'New York heritage with soul',
    color: 'from-green-700 to-emerald-500',
    href: '#',
  },
  {
    name: 'Palace',
    description: 'London skate culture',
    color: 'from-purple-600 to-pink-500',
    href: '#',
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const storeCardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  },
}

export function FeaturedStores() {
  return (
    <section aria-label="Featured Stores" className="py-16 md:py-24 px-6 md:px-8 max-w-7xl mx-auto">
      <motion.div
        className="flex items-center justify-between mb-10"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
      >
        <div>
          <h2 className="text-3xl md:text-4xl font-heading font-bold tracking-tight">
            Featured Stores
          </h2>
          <p className="text-muted-foreground text-sm mt-2">Curated brands from around the world</p>
        </div>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-100px' }}
      >
        {stores.map((store) => (
          <motion.div
            key={store.name}
            variants={storeCardVariants}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.3 }}
          >
            <a
              href={store.href}
              className="group block relative overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 p-6 md:p-8 h-full"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${store.name}`}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${store.color} opacity-5 group-hover:opacity-10 transition-opacity duration-500`}
              />

              <div className="relative z-10 flex flex-col h-full">
                <div
                  className={`w-14 h-14 rounded-full bg-gradient-to-br ${store.color} flex items-center justify-center mb-4`}
                >
                  <span className="text-white font-bold text-lg tracking-tight">
                    {store.name.charAt(0)}
                  </span>
                </div>

                <h3 className="text-lg font-heading font-bold mb-1 group-hover:text-primary transition-colors duration-300">
                  {store.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-6 flex-1">{store.description}</p>

                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-2.5 transition-all duration-300">
                  Visit Store <ArrowUpRight className="size-3.5" />
                </span>
              </div>
            </a>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        className="flex justify-center mt-10"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.4, duration: 0.6 }}
      >
        <Button variant="outline" asChild>
          <Link route="men">Explore All Stores</Link>
        </Button>
      </motion.div>
    </section>
  )
}
