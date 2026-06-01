import { cn } from '~/lib/utils'
import { Heart } from 'lucide-react'
import { Card, CardContent, CardTitle, CardDescription } from '~/components/ui/card'
import { Button } from '~/components/ui/button'

type DripProductCardProps = {
  name: string
  description: string
  price: number
  image: string
  isBestSeller: boolean
  isFavorited: boolean
}

export function DripProductCard(props: DripProductCardProps) {
  const { name, description, price, image, isFavorited } = props
  return (
    <Card className="w-full max-w-[320px] h-full">
      <CardContent className="h-full flex flex-col justify-between">
        <div>
          {/* Product Image */}
          <div className="relative mb-6">
            <div className="bg-gray-900 rounded-2xl flex items-center justify-center h-[280px] relative overflow-hidden">
              <img
                src={image}
                alt={name}
                className="w-full h-full object-fit scale-110 hover:scale-100 opacity-80 hover:opacity-100 transition-all duration-600 ease-in-out"
              />

              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 hover:bg-primary cursor-pointer"
              >
                <Heart
                  className={cn(
                    'w-6 h-6 transition-colors hover:text-secondary',
                    isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-800 hover:text-red-500'
                  )}
                />
              </Button>
            </div>
          </div>

          {/* Product Info */}
          <div className="mb-4">
            <CardTitle className="text-xl leading-tight mb-2">{name}</CardTitle>
            <CardDescription className="text-sm">{description}</CardDescription>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-2xl font-bold">${price.toFixed(2)}</p>

          <Button className="cursor-pointer">Add to Cart</Button>
        </div>
      </CardContent>
    </Card>
  )
}
