import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { ChevronRightIcon, PackageIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import CustomersLayout from '~/layouts/customers_layout'
import { Pager } from '~/components/dashboard/pager'
import { OrderStatusBadge } from '~/components/commerce/orders/order_status_badge'
import { ProductThumb } from '~/components/commerce/product_thumb'
import { Button } from '~/components/ui/button'
import { formatDate } from '~/lib/format'
import { formatNPR } from '@shared/format/money'
import { pluralize } from '~/lib/order'
import type { InertiaProps } from '~/types'
import type { Paginated } from '~/types/pagination'

type PageProps = InertiaProps<{
  orders: Paginated<Data.Order>
}>

const PREVIEW_COUNT = 3

function pageHref(page: number) {
  return page > 1 ? `/account/orders?page=${page}` : '/account/orders'
}

function OrderCard({ order }: { order: Data.Order }) {
  const preview = order.items.slice(0, PREVIEW_COUNT)
  const more = order.items.length - preview.length

  return (
    <Link
      route="account.orders.show"
      routeParams={{ orderNumber: order.orderNumber }}
      className="group block rounded-xl border border-border/60 bg-card text-card-foreground transition-colors hover:border-border focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Order <span className="font-mono">{order.orderNumber}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(order.placedAt ?? order.createdAt)}
            {order.shop && <> · {order.shop.name}</>}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex shrink-0 -space-x-3">
          {preview.map((item) => (
            <ProductThumb
              key={item.id}
              image={item.image}
              className="size-12 rounded-lg border-2 border-card"
            />
          ))}
          {more > 0 && (
            <span className="flex size-12 items-center justify-center rounded-lg border-2 border-card bg-muted text-xs font-medium text-muted-foreground">
              +{more}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm">{order.items.map((item) => item.name).join(', ')}</p>
          <p className="text-xs text-muted-foreground">
            {pluralize(order.itemCount, 'item')} · {order.paymentMethod}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-sm font-semibold tabular-nums">
            {formatNPR(order.grandTotalMinor)}
          </span>
          <ChevronRightIcon
            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </div>
    </Link>
  )
}

export default function AccountOrdersPage({ orders }: PageProps) {
  return (
    <>
      <Head title="My orders" />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-semibold sm:text-3xl">My orders</h1>
          {orders.metadata.total > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {pluralize(orders.metadata.total, 'order')}
            </p>
          )}
        </div>

        {orders.data.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-4 py-16 text-center">
            <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-muted">
              <PackageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold">No orders yet</h2>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              When you place an order, you can follow it here.
            </p>
            <Button size="lg" className="mt-6 h-11 rounded-xl px-6" asChild>
              <Link route="home">Start shopping</Link>
            </Button>
          </div>
        ) : (
          <>
            <ul className="space-y-4">
              {orders.data.map((order) => (
                <li key={order.id}>
                  <OrderCard order={order} />
                </li>
              ))}
            </ul>
            <Pager meta={orders.metadata} hrefFor={pageHref} />
          </>
        )}
      </div>
    </>
  )
}

AccountOrdersPage.layout = [RootLayout, CustomersLayout]
