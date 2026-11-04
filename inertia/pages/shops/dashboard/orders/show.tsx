import { useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { ArrowLeftIcon, ImageIcon, MapPinIcon, PhoneIcon, StickyNoteIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import { ShopDashboardLayout } from '~/layouts/shop_dashboard_layout'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { OrderStatusBadge } from '~/components/dashboard/order_status_badge'
import { formatDate, formatPrice } from '~/lib/format'
import type { InertiaProps } from '~/types'

type PageProps = InertiaProps<{
  order: Data.Order
  nextStatuses: string[]
}>

const ACTION_LABELS: Record<string, string> = {
  confirmed: 'Confirm order',
  shipped: 'Mark as shipped',
  delivered: 'Mark delivered & cash collected',
}

const STEPS = ['pending', 'confirmed', 'shipped', 'delivered']

export default function ShopOrderPage({ order, nextStatuses }: PageProps) {
  const { currentShop, errors } = usePage<Data.SharedProps>().props
  const base = `/shops/${currentShop?.slug}`
  const [processing, setProcessing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const address = order.shippingAddress
  const stepIndex = STEPS.indexOf(order.status)

  const move = (status: string) => {
    router.post(
      `/api/v1/shops/${currentShop?.slug}/orders/${order.orderNumber}/status`,
      { status },
      {
        preserveScroll: true,
        onStart: () => setProcessing(true),
        onFinish: () => {
          setProcessing(false)
          setConfirmCancel(false)
        },
      }
    )
  }

  const forward = nextStatuses.filter((status) => status !== 'cancelled')
  const canCancel = nextStatuses.includes('cancelled')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`${base}/orders`} aria-label="Back to orders">
              <ArrowLeftIcon className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{order.orderNumber}</h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-sm text-muted-foreground">Placed {formatDate(order.placedAt)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCancel && (
            <Button variant="outline" onClick={() => setConfirmCancel(true)} disabled={processing}>
              Cancel order
            </Button>
          )}
          {forward.map((status) => (
            <Button key={status} onClick={() => move(status)} disabled={processing}>
              {ACTION_LABELS[status] ?? status}
            </Button>
          ))}
        </div>
      </div>

      {errors?.status && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors.status}
        </p>
      )}

      {order.status !== 'cancelled' && (
        <ol className="grid grid-cols-4 gap-2 text-xs">
          {STEPS.map((step, index) => (
            <li key={step} className="space-y-1.5">
              <div
                className={
                  index <= stepIndex
                    ? 'h-1.5 rounded-full bg-primary'
                    : 'h-1.5 rounded-full bg-muted'
                }
              />
              <span className={index <= stepIndex ? 'font-medium' : 'text-muted-foreground'}>
                {
                  {
                    pending: 'Placed',
                    confirmed: 'Confirmed',
                    shipped: 'Shipped',
                    delivered: 'Delivered',
                  }[step]
                }
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border lg:col-span-2">
          <h2 className="border-b px-4 py-3 font-medium">Items</h2>
          <ul className="divide-y">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-5 text-muted-foreground/60" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[item.variantLabel, item.sku].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p>
                    {item.quantity} × {formatPrice(item.unitPrice)}
                  </p>
                  <p className="font-medium">{formatPrice(item.subTotal)}</p>
                </div>
              </li>
            ))}
          </ul>
          <dl className="space-y-1.5 border-t px-4 py-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatPrice(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery</dt>
              <dd>{order.shippingTotal === 0 ? 'Free' : formatPrice(order.shippingTotal)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Collect on delivery</dt>
              <dd>{formatPrice(order.grandTotal)}</dd>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>Payment</dt>
              <dd className="capitalize">
                {order.paymentMethod} · {order.paymentStatus}
              </dd>
            </div>
          </dl>
        </section>

        <div className="space-y-6">
          <section className="space-y-3 rounded-xl border p-4 text-sm">
            <h2 className="font-medium">Deliver to</h2>
            {address ? (
              <>
                <p className="font-medium">{address.recipientName}</p>
                <p className="flex gap-2 text-muted-foreground">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {address.streetAddress}
                    {address.area ? `, ${address.area}` : ''}
                    <br />
                    {[address.city, address.municipality, address.district, address.province]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </p>
                {address.recipientPhone && (
                  <a
                    href={`tel:${address.recipientPhone}`}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                  >
                    <PhoneIcon className="size-4" />
                    {address.recipientPhone}
                  </a>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">No address on this order.</p>
            )}
            <p className="border-t pt-3 text-xs text-muted-foreground">
              {order.customer
                ? `Account: ${order.customer.fullName} · ${order.customer.email}`
                : 'Guest order, placed without an account. Call the number above to confirm it.'}
            </p>
          </section>

          {order.notes && (
            <section className="space-y-2 rounded-xl border p-4 text-sm">
              <h2 className="flex items-center gap-2 font-medium">
                <StickyNoteIcon className="size-4" />
                Note from customer
              </h2>
              <p className="whitespace-pre-line text-muted-foreground">{order.notes}</p>
            </section>
          )}
        </div>
      </div>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel order {order.orderNumber}?</DialogTitle>
            <DialogDescription>
              The items go back into stock and the customer sees the order as cancelled. This
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Keep order
            </Button>
            <Button variant="destructive" onClick={() => move('cancelled')} disabled={processing}>
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

ShopOrderPage.layout = [RootLayout, ShopDashboardLayout]
