import { Link } from '@adonisjs/inertia/react'
import { AlertCircleIcon, StoreIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import { PriceRow, deliveryFee } from '~/components/commerce/price_rows'
import { ProductThumb } from '~/components/commerce/product_thumb'
import { formatPrice } from '~/lib/format'
import { orderableQuantity, pluralize } from '~/lib/order'
import { cn } from '~/lib/utils'

/*
 * The cart as it will be ordered: one package (and one order) per shop,
 * each with its own delivery fee.
 */
export function CheckoutReview({ cart }: { cart: Data.CartSummary }) {
  const count = cart.shops.length

  return (
    <div className="space-y-4">
      {cart.shops.map((group, index) => (
        <div key={group.shop.id} className="rounded-xl border border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <StoreIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{group.shop.name}</span>
            </p>
            {count > 1 && (
              <span className="text-xs text-muted-foreground">
                Package {index + 1} of {count}
              </span>
            )}
          </div>

          <ul className="divide-y divide-border/50 px-4">
            {group.items.map((line) => (
              <li key={line.id} className="flex gap-3 py-3">
                <ProductThumb
                  image={line.product.image}
                  className={cn('size-14', !line.available && 'opacity-50 grayscale')}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    route="products.show"
                    routeParams={{ slug: line.product.slug }}
                    className="line-clamp-2 text-sm font-medium hover:underline"
                  >
                    {line.product.name}
                  </Link>
                  {line.variant.label && (
                    <p className="text-xs text-muted-foreground">{line.variant.label}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {line.quantity} × {formatPrice(line.variant.price)}
                  </p>
                  {line.problem && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive">
                      <AlertCircleIcon className="size-3.5 shrink-0" aria-hidden="true" />
                      {line.problem}
                    </p>
                  )}
                </div>
                <p
                  className={cn(
                    'shrink-0 text-sm font-medium tabular-nums',
                    !line.available && 'text-muted-foreground line-through'
                  )}
                >
                  {formatPrice(line.lineTotal)}
                </p>
              </li>
            ))}
          </ul>

          {group.subtotal > 0 && (
            <dl className="space-y-1 border-t border-border/60 px-4 py-2.5 text-sm">
              <PriceRow
                label={`Subtotal (${pluralize(orderableQuantity(group.items), 'item')})`}
                value={formatPrice(group.subtotal)}
              />
              <PriceRow label="Delivery" value={deliveryFee(group.shipping)} />
            </dl>
          )}
        </div>
      ))}
    </div>
  )
}
