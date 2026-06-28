import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link } from '@adonisjs/inertia/react'
import { Button } from '~/components/ui/button'
import { DripProductCard } from '~/components/commerce/drip_product_card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/components/ui/carousel'
import ManImage from '~/assets/hero-image/man.png'
import WomanImage from '~/assets/hero-image/woman.png'
import ShoesImage from '~/assets/men/shoes.jpg'
import MaleModel from '~/assets/men/male-model.jpg'

const mockProducts = [
  {
    name: 'Oversized Hoodie',
    description: 'Heavyweight cotton fleece',
    price: 89.99,
    image: ManImage,
    hoverImage: MaleModel,
    isBestSeller: true,
    isFavorited: false,
  },
  {
    name: 'Cargo Pants',
    description: 'Relaxed fit with taper',
    price: 74.99,
    image: WomanImage,
    hoverImage: ShoesImage,
    isBestSeller: false,
    isFavorited: true,
  },
  {
    name: 'Varsity Jacket',
    description: 'Wool blend with leather sleeves',
    price: 149.99,
    image: ShoesImage,
    hoverImage: ManImage,
    isBestSeller: true,
    isFavorited: false,
  },
  {
    name: 'Graphic Tee',
    description: 'Limited edition print',
    price: 39.99,
    image: MaleModel,
    hoverImage: WomanImage,
    isBestSeller: false,
    isFavorited: false,
  },
  {
    name: 'Track Pants',
    description: 'French terry jogger',
    price: 64.99,
    image: ManImage,
    hoverImage: ShoesImage,
    isBestSeller: false,
    isFavorited: false,
  },
  {
    name: 'Denim Jacket',
    description: 'Classic trucker fit',
    price: 119.99,
    image: WomanImage,
    hoverImage: MaleModel,
    isBestSeller: false,
    isFavorited: true,
  },
]

export function FeaturedProducts() {
  return (
    <section
      aria-label="Featured Products"
      className="py-16 md:py-24 px-6 md:px-8 max-w-7xl mx-auto"
    >
      <motion.div
        className="flex items-center justify-between mb-10"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
      >
        <div>
          <h2 className="text-3xl md:text-4xl font-heading font-bold tracking-tight">
            Featured Drops
          </h2>
          <p className="text-muted-foreground text-sm mt-2">Curated picks from this season</p>
        </div>
        <Button variant="ghost" className="hidden md:inline-flex gap-2" asChild>
          <Link route="men">
            Shop All <ArrowRight className="size-4" />
          </Link>
        </Button>
      </motion.div>

      <Carousel
        opts={{
          align: 'start',
          loop: true,
        }}
        className="w-full"
      >
        <CarouselContent>
          {mockProducts.map((product) => (
            <CarouselItem
              key={product.name}
              className="basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
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
