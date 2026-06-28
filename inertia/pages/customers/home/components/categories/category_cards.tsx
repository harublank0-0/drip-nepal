import { Link } from '@adonisjs/inertia/react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Button } from '~/components/ui/button'
import ManImage from '~/assets/hero-image/man.png'
import WomanImage from '~/assets/hero-image/woman.png'
import ShoesImage from '~/assets/men/shoes.jpg'

const categories = [
  {
    title: 'New Arrivals',
    description: 'The latest drops from top brands',
    image: ManImage,
    route: 'men' as const,
    span: 'md:col-span-2 md:row-span-2',
  },
  {
    title: 'Best Sellers',
    description: 'Most popular this season',
    image: WomanImage,
    route: 'women' as const,
    span: '',
  },
  {
    title: 'Sale',
    description: 'Up to 40% off select styles',
    image: ShoesImage,
    route: 'men' as const,
    span: '',
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] },
  },
}

export function CategoryCards() {
  return (
    <section
      aria-label="Shop by Category"
      className="py-16 md:py-24 px-6 md:px-8 max-w-7xl mx-auto"
    >
      <motion.div
        className="flex items-center justify-between mb-10"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="text-3xl md:text-4xl font-heading font-bold tracking-tight">
          Shop by Category
        </h2>
        <Button variant="ghost" className="hidden md:inline-flex gap-2" asChild>
          <Link route="men">
            View All <ArrowRight className="size-4" />
          </Link>
        </Button>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-100px' }}
      >
        {categories.map((cat) => (
          <motion.div
            key={cat.title}
            variants={cardVariants}
            className={`group relative overflow-hidden rounded-2xl h-[300px] md:h-[400px] ${cat.span}`}
          >
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105"
              style={{ backgroundImage: `url(${cat.image})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
              <h3 className="text-2xl md:text-3xl font-heading font-bold text-white mb-2">
                {cat.title}
              </h3>
              <p className="text-white/60 text-sm mb-4">{cat.description}</p>
              <Button
                variant="outline"
                size="sm"
                className="bg-transparent border-white/20 text-white hover:bg-white hover:text-black group/btn"
                asChild
              >
                <Link route={cat.route}>
                  Shop Now{' '}
                  <ArrowRight className="size-3 ml-1 transition-transform group-hover/btn:translate-x-0.5" />
                </Link>
              </Button>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
