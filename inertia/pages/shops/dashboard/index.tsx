import { usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import {
  AlertTriangleIcon,
  ClockIcon,
  PackageCheckIcon,
  PlusIcon,
  ShoppingBagIcon,
  TruckIcon,
  WalletIcon,
} from 'lucide-react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import { ShopDashboardLayout } from '~/layouts/shop_dashboard_layout'
import { Button } from '~/components/ui/button'
import { OrderStatusBadge } from '~/components/dashboard/order_status_badge'
import { formatDate, formatPrice } from '~/lib/format'
import type { InertiaProps } from '~/types'

type PageProps = InertiaProps<{
  stats: {
    ordersToConfirm: number
    ordersToShip: number
    deliveredOrders: number
    revenue: number
    activeProducts: number
    draftProducts: number
  }
  lowStock: { productId: string; name: string; sku: string; quantity: number }[]
  recentOrders: Data.Order[]
}>

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string
  value: string | number
  hint?: string
  icon: typeof ClockIcon
  href?: string
}) {
  const content = (
    <div className="flex h-full items-start justify-between gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/30">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Icon className="size-5 text-muted-foreground" />
    </div>
  )

  return href ? <Link href={href}>{content}</Link> : content
}

export default function ShopDashboardPage({ stats, lowStock, recentOrders }: PageProps) {
  const { currentShop } = usePage<Data.SharedProps>().props
  const base = `/shops/${currentShop?.slug}`
  const isPending = currentShop?.status === 'pending'
  const isNew = stats.activeProducts === 0 && stats.draftProducts === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{currentShop?.name}</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s what needs your attention.</p>
        </div>
        <Button asChild>
          <Link href={`${base}/products/create`}>
            <PlusIcon className="size-4" />
            Add product
          </Link>
        </Button>
      </div>

      {isPending && (
        <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <ClockIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">Your shop is waiting for approval</p>
            <p className="text-muted-foreground">
              You can add products now. They&apos;ll appear on Drip Nepal once the Drip Nepal team
              approves your shop.
            </p>
          </div>
        </div>
      )}

      {currentShop?.status === 'suspended' && (
        <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>Your shop is suspended and hidden from the storefront. Contact Drip Nepal support.</p>
        </div>
      )}

      {isNew && (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <ShoppingBagIcon className="mx-auto mb-3 size-8 text-muted-foreground/60" />
          <h2 className="font-medium">Add your first product</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Upload photos, set sizes, colors, prices and stock. Customers order and pay cash on
            delivery.
          </p>
          <Button className="mt-4" asChild>
            <Link href={`${base}/products/create`}>Add product</Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="To confirm"
          value={stats.ordersToConfirm}
          icon={ClockIcon}
          href={`${base}/orders?status=pending`}
        />
        <StatCard
          label="To ship"
          value={stats.ordersToShip}
          icon={TruckIcon}
          href={`${base}/orders?status=confirmed`}
        />
        <StatCard
          label="Collected (COD)"
          value={formatPrice(stats.revenue)}
          hint={`${stats.deliveredOrders} delivered orders`}
          icon={WalletIcon}
        />
        <StatCard
          label="Live products"
          value={stats.activeProducts}
          hint={stats.draftProducts ? `${stats.draftProducts} drafts` : undefined}
          icon={PackageCheckIcon}
          href={`${base}/products`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border lg:col-span-2">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-medium">Recent orders</h2>
            <Link href={`${base}/orders`} className="text-sm text-muted-foreground hover:underline">
              View all
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <ul className="divide-y">
              {recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`${base}/orders/${order.orderNumber}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/20"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{order.orderNumber}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {order.customer?.fullName} · {order.itemCount}{' '}
                        {order.itemCount === 1 ? 'item' : 'items'} · {formatDate(order.placedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-medium">{formatPrice(order.grandTotal)}</span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border">
          <div className="border-b px-4 py-3">
            <h2 className="font-medium">Low stock</h2>
          </div>
          {lowStock.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Everything is well stocked.
            </p>
          ) : (
            <ul className="divide-y">
              {lowStock.map((row) => (
                <li key={row.sku}>
                  <Link
                    href={`${base}/products/${row.productId}/edit`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/20"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{row.name}</span>
                      <span className="text-xs text-muted-foreground">{row.sku}</span>
                    </span>
                    <span
                      className={
                        row.quantity === 0 ? 'font-medium text-destructive' : 'text-amber-600'
                      }
                    >
                      {row.quantity === 0 ? 'Sold out' : `${row.quantity} left`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

ShopDashboardPage.layout = [RootLayout, ShopDashboardLayout]
