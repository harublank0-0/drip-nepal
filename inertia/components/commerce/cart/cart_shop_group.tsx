import type { ReactNode } from 'react'
import { Link } from '@adonisjs/inertia/react'
import { StoreIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import { deliveryFee } from '~/components/commerce/price_rows'
import { pluralize } from '~/lib/order'
import { FreeShippingProgress } from './free_shipping_progress'

export type CartShopGroupData = Data.CartSummary['shops'][number]

type CartShopGroupProps = {
  group: CartShopGroupData
  children: ReactNode
}

/*
 * One shop's part of the cart. Each shop ships separately, so delivery is
 * shown per shop.
 */
export function CartShopGroup({ group, children }: CartShopGroupProps) {
  const headingId = `cart-shop-${group.shop.id}`
  const quantity = group.items.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-border/60 bg-card text-card-foreground"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 id={headingId} className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <StoreIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Link
            route="stores.show"
            routeParams={{ slug: group.shop.slug }}
            className="truncate hover:underline"
          >
            {group.shop.name}
          </Link>
        </h2>
        <span className="shrink-0 text-xs text-muted-foreground">
          {pluralize(quantity, 'item')}
        </span>
      </header>

      <ul className="divide-y divide-border/50 px-4">{children}</ul>

      {group.subtotalMinor > 0 && (
        <footer className="space-y-3 border-t border-border/60 px-4 py-3">
          <FreeShippingProgress
            shopName={group.shop.name}
            subtotalMinor={group.subtotalMinor}
            shippingMinor={group.shippingMinor}
          />
          <dl className="flex items-baseline justify-between text-sm">
            <dt className="text-muted-foreground">Delivery from this shop</dt>
            <dd className="tabular-nums">{deliveryFee(group.shippingMinor)}</dd>
          </dl>
        </footer>
      )}
    </section>
  )
}
