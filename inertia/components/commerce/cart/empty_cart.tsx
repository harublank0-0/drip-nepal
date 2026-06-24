import { ShoppingBag, ArrowLeft } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Link } from '@adonisjs/inertia/react'
import { MOCK_RECOMMENDED_PRODUCTS } from '~/lib/mock-data/cart'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/components/ui/carousel'

type EmptyCartProps = {
  variant?: 'drawer' | 'page'
}

export function EmptyCart({ variant = 'page' }: EmptyCartProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-muted">
        <ShoppingBag className="size-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold mb-1">Your cart is empty</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-[240px]">
        Looks like you haven&apos;t added anything to your cart yet.
      </p>
      <Button variant="outline" size="sm" className="rounded-full px-5" asChild>
        {variant === 'drawer' ? (
          <Link href="/men">
            <ArrowLeft className="size-3.5 mr-1.5" />
            Continue Shopping
          </Link>
        ) : (
          <Link href="/men">
            <ArrowLeft className="size-3.5 mr-1.5" />
            Continue Shopping
          </Link>
        )}
      </Button>

      {variant === 'page' && (
        <div className="mt-12 w-full max-w-3xl text-left">
          <h4 className="text-sm font-medium mb-4 text-muted-foreground">Trending Now</h4>
          <Carousel
            opts={{
              align: 'start',
              dragFree: true,
            }}
          >
            <CarouselContent className="-ml-3">
              {MOCK_RECOMMENDED_PRODUCTS.slice(0, 5).map((product) => (
                <CarouselItem key={product.id} className="pl-3 basis-[150px] sm:basis-[180px]">
                  <div className="space-y-2">
                    <div className="aspect-[4/5] overflow-hidden rounded-lg bg-muted">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="size-full object-cover"
                      />
                    </div>
                    <h5 className="text-xs font-medium leading-tight line-clamp-1">
                      {product.name}
                    </h5>
                    <p className="text-xs font-semibold">
                      Rs. {product.price.toLocaleString('ne-NP')}
                    </p>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      )}
    </div>
  )
}
