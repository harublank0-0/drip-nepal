import { useRef } from 'react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { Carousel, CarouselContent, CarouselItem } from '~/components/ui/carousel'
import { Button } from '~/components/ui/button'
import { MOCK_RECOMMENDED_PRODUCTS } from '~/lib/mock-data/cart'
import { useCart } from '~/hooks/use_cart'
import type { CartItem } from '~/types/cart'

type RecommendationsProps = {
  title?: string
  variant?: 'drawer' | 'page'
}

export function Recommendations({
  title = 'You may also like',
  variant = 'page',
}: RecommendationsProps) {
  const { addItem, openDrawer } = useCart()
  const products = MOCK_RECOMMENDED_PRODUCTS.slice(0, variant === 'drawer' ? 4 : 6)

  const idCounter = useRef(0)
  const handleQuickAdd = (product: (typeof products)[0]) => {
    addItem({
      id: `quick-${product.id}-${++idCounter.current}`,
      productId: product.id,
      storeId: 'store-1',
      name: product.name,
      image: product.image,
      storeName: product.storeName,
      storeLogo: '',
      color: '',
      size: 'M',
      price: product.price,
      originalPrice: product.originalPrice,
      quantity: 1,
      maxQuantity: 5,
      inStock: true,
      slug: product.id,
    } as CartItem)
    openDrawer()
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
      <Carousel
        opts={{
          align: 'start',
          dragFree: true,
        }}
      >
        <CarouselContent className="-ml-2">
          {products.map((product) => (
            <CarouselItem
              key={product.id}
              className={`pl-2 ${variant === 'drawer' ? 'basis-[130px]' : 'basis-[150px] sm:basis-[180px]'}`}
            >
              <motion.div
                whileHover={{ y: -3 }}
                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                className="group cursor-pointer space-y-2"
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 flex items-end justify-center p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Button
                      size="xs"
                      variant="secondary"
                      className="w-full h-7 rounded-full bg-background/90 backdrop-blur-sm text-[11px] font-medium shadow-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleQuickAdd(product)
                      }}
                    >
                      <Plus className="size-3 mr-1" />
                      Quick Add
                    </Button>
                  </div>
                </div>
                <div className="space-y-0.5 px-0.5">
                  <h5 className="text-xs font-medium leading-tight line-clamp-1">{product.name}</h5>
                  <p className="text-[11px] text-muted-foreground">{product.storeName}</p>
                  <p className="text-xs font-semibold tabular-nums">
                    Rs. {product.price.toLocaleString('ne-NP')}
                  </p>
                </div>
              </motion.div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  )
}
