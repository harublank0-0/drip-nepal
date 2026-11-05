import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { BanknoteIcon, CircleCheckIcon, MapPinIcon, StickyNoteIcon, StoreIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import CustomersLayout from '~/layouts/customers_layout'
import { AddressBlock } from '~/components/commerce/address_block'
import { OrderItemsList } from '~/components/commerce/orders/order_items_list'
import { OrderStatusBadge } from '~/components/commerce/orders/order_status_badge'
import { PriceRows } from '~/components/commerce/price_rows'
import { Button } from '~/components/ui/button'
import { OrderIds } from '~/components/commerce/orders/order_ids'
import { formatNPR } from '@shared/format/money'
import { pluralize } from '~/lib/order'
import type { InertiaProps } from '~/types'

type PageProps = InertiaProps<{
  orders: Data.Order[]
  /* Placed without an account: they track it with the order ID. */
  guest?: boolean
}>

export default function CheckoutSuccessPage({ orders, guest = false }: PageProps) {
  const count = orders.length
  const total = orders.reduce((sum, order) => sum + order.grandTotalMinor, 0)
  /* All orders of a checkout go to the same address with the same note. */
  const address = orders[0]?.shippingAddress
  const notes = orders[0]?.notes

  return (
    <>
      <Head title="Order placed" />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CircleCheckIcon
              className="size-8 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
          </div>
          <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
            Thank you, your order is placed
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {count > 1
              ? `Your items come from ${count} shops, so we split them into ${count} orders. Each shop confirms and delivers its order separately.`
              : `${orders[0]?.shop?.name ?? 'The shop'} will confirm your order soon.`}
          </p>
        </header>

        <OrderIds orders={orders} guest={guest} />

        <section
          aria-label="Payment"
          className="mt-4 flex gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
        >
          <BanknoteIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium">
              Cash on delivery · <span className="tabular-nums">{formatNPR(total)}</span>
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {count > 1
                ? 'Keep cash ready. You pay each shop when its package arrives.'
                : 'Keep cash ready. You pay when your order arrives.'}
            </p>
          </div>
        </section>

        <div className="mt-6 space-y-4">
          {orders.map((order) => (
            <article
              key={order.id}
              aria-labelledby={`order-${order.id}`}
              className="rounded-xl border border-border/60 bg-card text-card-foreground"
            >
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
                <div className="min-w-0">
                  <h2 id={`order-${order.id}`} className="text-sm font-semibold">
                    Order{' '}
                    <Link
                      // A guest has no account: their order opens on the tracking page.
                      route={guest ? 'orders.track.show' : 'account.orders.show'}
                      routeParams={{ orderNumber: order.orderNumber }}
                      className="font-mono underline-offset-4 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </h2>
                  {order.shop && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <StoreIcon className="size-3.5" aria-hidden="true" />
                      {order.shop.name} · {pluralize(order.itemCount, 'item')}
                    </p>
                  )}
                </div>
                <OrderStatusBadge status={order.status} />
              </header>
              <div className="px-4">
                <OrderItemsList items={order.items} />
              </div>
              <div className="border-t border-border/60 px-4 py-3">
                <PriceRows
                  subtotalMinor={order.subtotalMinor}
                  shippingMinor={order.shippingTotalMinor}
                  discountMinor={order.discountTotalMinor}
                  totalMinor={order.grandTotalMinor}
                  totalLabel="To pay on delivery"
                />
              </div>
            </article>
          ))}
        </div>

        {(address || notes) && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {address && (
              <section className="rounded-xl border border-border/60 bg-card p-4">
                <h2 className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <MapPinIcon className="size-3.5" aria-hidden="true" />
                  Delivering to
                </h2>
                <AddressBlock address={address} />
              </section>
            )}
            {notes && (
              <section className="rounded-xl border border-border/60 bg-card p-4">
                <h2 className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <StickyNoteIcon className="size-3.5" aria-hidden="true" />
                  Your note
                </h2>
                <p className="text-sm whitespace-pre-line">{notes}</p>
              </section>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" className="h-12 rounded-xl sm:flex-1" asChild>
            {guest ? (
              <Link route="orders.track">Track my order</Link>
            ) : (
              <Link route="account.orders.index">View my orders</Link>
            )}
          </Button>
          <Button size="lg" variant="outline" className="h-12 rounded-xl sm:flex-1" asChild>
            <Link route="home">Continue shopping</Link>
          </Button>
        </div>
      </div>
    </>
  )
}

CheckoutSuccessPage.layout = [RootLayout, CustomersLayout]
