import { TruckIcon } from 'lucide-react'
import { formatPrice } from '~/lib/format'
import { FREE_SHIPPING_THRESHOLD } from '~/lib/order'

type FreeShippingProgressProps = {
  shopName: string
  subtotal: number
  shipping: number
}

/*
 * Delivery is charged per shop, free once that shop's part of the cart
 * reaches the threshold.
 */
export function FreeShippingProgress({ shopName, subtotal, shipping }: FreeShippingProgressProps) {
  if (subtotal <= 0) return null

  if (shipping === 0) {
    return (
      <p className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <TruckIcon className="size-3.5 shrink-0" aria-hidden="true" />
        Free delivery from {shopName}
      </p>
    )
  }

  const remaining = Math.max(FREE_SHIPPING_THRESHOLD - subtotal, 0)
  const progress = Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100)

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <TruckIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Add <span className="font-medium text-foreground">{formatPrice(remaining)}</span> more
          from {shopName} for free delivery
        </span>
      </p>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
