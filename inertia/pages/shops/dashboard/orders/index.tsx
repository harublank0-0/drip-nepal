import { usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { PackageIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import { ShopDashboardLayout } from '~/layouts/shop_dashboard_layout'
import { Pager } from '~/components/dashboard/pager'
import { OrderStatusBadge } from '~/components/dashboard/order_status_badge'
import { formatDate } from '~/lib/format'
import { formatNPR } from '@shared/format/money'
import { cn } from '~/lib/utils'
import type { InertiaProps } from '~/types'
import type { Paginated } from '~/types/pagination'

type PageProps = InertiaProps<{
  orders: Paginated<Data.Order.Variants['forShop']>
  filters: { status: string }
  counts: Record<string, number>
}>

const TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'To confirm' },
  { value: 'confirmed', label: 'To ship' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function ShopOrdersPage({ orders, filters, counts }: PageProps) {
  const { currentShop } = usePage<Data.SharedProps>().props
  const base = `/shops/${currentShop?.slug}`
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

  const listUrl = (status: string, page?: number) => {
    const query = new URLSearchParams()
    if (status) query.set('status', status)
    if (page && page > 1) query.set('page', String(page))
    const qs = query.toString()
    return `${base}/orders${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Confirm new orders, ship them, and mark them delivered when the cash is collected.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border p-1" role="tablist">
        {TABS.map((tab) => {
          const count = tab.value ? (counts[tab.value] ?? 0) : total
          const active = filters.status === tab.value
          return (
            <Link
              key={tab.value}
              href={listUrl(tab.value)}
              role="tab"
              aria-selected={active}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm',
                active ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              <span className="rounded-full bg-background px-1.5 text-xs tabular-nums">
                {count}
              </span>
            </Link>
          )
        })}
      </div>

      {orders.data.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <PackageIcon className="mb-3 size-10 text-muted-foreground/50" />
          <h2 className="font-medium">No orders here</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {total === 0
              ? 'When customers order your products, they show up here.'
              : 'No orders with this status.'}
          </p>
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border">
          {/* relative: makes this box the containing block of absolutely positioned
              children such as sr-only labels, so they can't escape it and widen the page */}
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.data.map((order) => (
                <tr key={order.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <Link
                      href={`${base}/orders/${order.orderNumber}`}
                      className="font-medium hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">{formatDate(order.placedAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{order.shippingAddress?.recipientName ?? order.customer?.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.shippingAddress?.city}, {order.shippingAddress?.district}
                    </p>
                  </td>
                  <td className="px-4 py-3">{order.itemCount}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatNPR(order.grandTotalMinor)}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager meta={orders.metadata} hrefFor={(page) => listUrl(filters.status, page)} />
    </div>
  )
}

ShopOrdersPage.layout = [RootLayout, ShopDashboardLayout]
