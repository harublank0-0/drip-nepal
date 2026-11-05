import { Link } from '@adonisjs/inertia/react'
import { ArrowRightIcon, BanknoteIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import { PriceRows } from '~/components/commerce/price_rows'
import { Button } from '~/components/ui/button'
import { orderableQuantity, pluralize } from '~/lib/order'

type CartSummaryProps = {
  cart: Data.CartSummary
}

export function CartSummary({ cart }: CartSummaryProps) {
  const shopCount = cart.shops.filter((group) => group.subtotalMinor > 0).length
  const blocked = cart.hasUnavailableItems
  const orderable = orderableQuantity(cart.shops.flatMap((group) => group.items))

  return (
    <section
      aria-labelledby="cart-summary-heading"
      className="rounded-xl border border-border/60 bg-card p-5 text-card-foreground"
    >
      <h2 id="cart-summary-heading" className="mb-4 font-heading text-lg font-semibold">
        Order summary
      </h2>

      <PriceRows
        subtotalMinor={cart.subtotalMinor}
        subtotalLabel={`Subtotal (${pluralize(orderable, 'item')})`}
        shippingMinor={cart.shippingTotalMinor}
        shippingLabel={shopCount > 1 ? `Delivery (${shopCount} shops)` : 'Delivery'}
        totalMinor={cart.totalMinor}
      />

      {shopCount > 1 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Your items come from {shopCount} shops. Each shop delivers its part separately and charges
          its own delivery fee.
        </p>
      )}

      <div className="mt-5 space-y-3">
        {blocked ? (
          <>
            <Button size="lg" className="h-11 w-full rounded-xl" disabled>
              Proceed to checkout
            </Button>
            <p className="text-xs text-destructive">
              Remove or update the items marked above to check out.
            </p>
          </>
        ) : (
          <Button size="lg" className="h-11 w-full rounded-xl" asChild>
            <Link route="checkout.show">
              Proceed to checkout
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        )}
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <BanknoteIcon className="size-3.5" aria-hidden="true" />
          Cash on delivery
        </p>
      </div>
    </section>
  )
}
