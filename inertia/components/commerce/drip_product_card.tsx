import { useState } from 'react'
import { cn } from '~/lib/utils'
import { Heart } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardTitle, CardDescription } from '~/components/ui/card'
import { Button } from '~/components/ui/button'

type DripProductCardProps = {
  name: string
  description: string
  price: number
  image: string
  hoverImage?: string
  isBestSeller: boolean
  isFavorited: boolean
}

export function DripProductCard(props: DripProductCardProps) {
  const { name, description, price, image, hoverImage, isFavorited } = props
  const [isHovered, setIsHovered] = useState(false)

  return (
    <Card
      className="w-full max-w-[320px] h-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="h-full flex flex-col justify-between">
        <div>
          <div className="relative mb-6" role="group" aria-label={`${name} - $${price.toFixed(2)}`}>
            <div className="bg-gray-900 rounded-2xl flex items-center justify-center h-[280px] relative overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.img
                  key={isHovered && hoverImage ? 'hover' : 'default'}
                  src={isHovered && hoverImage ? hoverImage : image}
                  alt={name}
                  className="w-full h-full object-cover"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                />
              </AnimatePresence>

              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 hover:bg-primary cursor-pointer"
                aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Heart
                  className={cn(
                    'w-6 h-6 transition-colors hover:text-secondary',
                    isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-800 hover:text-red-500'
                  )}
                />
              </Button>

              {props.isBestSeller && (
                <span className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-medium px-2 py-1 rounded-md">
                  Best Seller
                </span>
              )}
            </div>
          </div>

          <div className="mb-4">
            <CardTitle className="text-xl leading-tight mb-2">{name}</CardTitle>
            <CardDescription className="text-sm">{description}</CardDescription>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-2xl font-bold">${price.toFixed(2)}</p>

          <Button className="cursor-pointer" aria-label={`Add ${name} to cart`}>
            Add to Cart
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
