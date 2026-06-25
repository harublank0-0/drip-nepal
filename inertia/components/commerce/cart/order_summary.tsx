import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { Link } from '@adonisjs/inertia/react'

type OrderSummaryProps = {
  subtotal: number
  shipping: number
  discount: number
  total: number
  itemCount: number
  showCheckoutButton?: boolean
  showViewCartButton?: boolean
  variant?: 'drawer' | 'page'
}

export function OrderSummary({
  subtotal,
  shipping,
  discount,
  total,
  itemCount,
  showCheckoutButton = true,
  showViewCartButton = false,
  variant = 'page',
}: OrderSummaryProps) {
  const formatPrice = (value: number) => `Rs. ${value.toLocaleString('ne-NP')}`

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal ({itemCount} items)</span>
          <span className="font-medium tabular-nums">{formatPrice(subtotal)}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Shipping</span>
          <span
            className={
              shipping === 0
                ? 'text-green-600 dark:text-green-400 font-medium tabular-nums'
                : 'tabular-nums'
            }
          >
            {shipping === 0 ? 'Free' : formatPrice(shipping)}
          </span>
        </div>

        {discount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Discount</span>
            <span className="text-green-600 dark:text-green-400 font-medium tabular-nums">
              -{formatPrice(discount)}
            </span>
          </div>
        )}
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Estimated Total</span>
        <span className="text-base font-semibold tabular-nums">{formatPrice(total)}</span>
      </div>

      <div className="space-y-2 pt-1">
        {showCheckoutButton && (
          <Button size="lg" className="w-full h-11 text-sm font-medium rounded-xl" asChild>
            <Link href="/checkout">Proceed to Checkout</Link>
          </Button>
        )}

        {showViewCartButton && variant === 'drawer' && (
          <Button variant="ghost" size="sm" className="w-full h-9 text-xs" asChild>
            <Link href="/cart">View Full Cart</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
