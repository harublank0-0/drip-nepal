import { useState } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  BanknoteIcon,
  CircleXIcon,
  MapPinIcon,
  StickyNoteIcon,
  StoreIcon,
} from 'lucide-react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import CustomersLayout from '~/layouts/customers_layout'
import { AddressBlock } from '~/components/commerce/address_block'
import { OrderItemsList } from '~/components/commerce/orders/order_items_list'
import { OrderProgress } from '~/components/commerce/orders/order_progress'
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from '~/components/commerce/orders/order_status_badge'
import { PriceRows } from '~/components/commerce/price_rows'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Spinner } from '~/components/ui/spinner'
import { ContactOptions, hasContact, useSupport } from '~/components/support/contact_options'
import { formatDate } from '~/lib/format'
import { formatNPR } from '@shared/format/money'
import { cancelOrderUrl, pluralize, trackCancelUrl } from '~/lib/order'
import type { InertiaProps } from '~/types'

type PageProps = InertiaProps<{
  order: Data.Order
  /* Opened from order tracking, without an account. */
  guest?: boolean
}>

function statusMessage(order: Data.Order) {
  const shop = order.shop?.name ?? 'The shop'
  switch (order.status) {
    case 'pending':
      return `${shop} hasn’t confirmed your order yet. You can cancel it until they do.`
    case 'confirmed':
      return `${shop} confirmed your order and is getting it ready.`
    case 'shipped':
      return `Your order is on its way. Keep ${formatNPR(order.grandTotalMinor)} ready in cash.`
    case 'delivered':
      return `Delivered. Thanks for shopping with ${shop}.`
    default:
      return null
  }
}

function paymentMessage(order: Data.Order) {
  switch (order.paymentStatus) {
    case 'paid':
      return 'Paid in cash on delivery.'
    case 'voided':
      return 'The order was cancelled before delivery, so there is nothing to pay.'
    default:
      return `Pay ${formatNPR(order.grandTotalMinor)} in cash when your order arrives.`
  }
}

export default function AccountOrderPage({ order, guest = false }: PageProps) {
  const { errors } = usePage<Data.SharedProps>().props
  const support = useSupport()
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [attempted, setAttempted] = useState(false)

  const cancelError =
    attempted && typeof errors?.status === 'string' ? (errors.status as string) : undefined
  const cancelled = order.status === 'cancelled'
  const canCancel = order.status === 'pending'

  const cancelOrder = () => {
    router.post(
      guest ? trackCancelUrl(order.orderNumber) : cancelOrderUrl(order.orderNumber),
      {},
      {
        preserveScroll: true,
        preserveState: true,
        onStart: () => {
          setCancelling(true)
          setAttempted(true)
        },
        onFinish: () => {
          setCancelling(false)
          setConfirming(false)
        },
      }
    )
  }

  return (
    <>
      <Head title={`Order ${order.orderNumber}`} />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          route={guest ? 'orders.track' : 'account.orders.index'}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          {guest ? 'Track order' : 'My orders'}
        </Link>

        <header className="mt-4 mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
              Order <span className="font-mono text-xl sm:text-2xl">{order.orderNumber}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Placed {formatDate(order.placedAt ?? order.createdAt)} ·{' '}
              {pluralize(order.itemCount, 'item')} · {formatNPR(order.grandTotalMinor)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <OrderStatusBadge status={order.status} />
              <PaymentStatusBadge status={order.paymentStatus} />
            </div>
          </div>
          {canCancel && (
            <Button
              variant="outline"
              size="lg"
              className="h-10 rounded-xl"
              onClick={() => setConfirming(true)}
            >
              <CircleXIcon className="size-4" aria-hidden="true" />
              Cancel order
            </Button>
          )}
        </header>

        {cancelError && (
          <Alert variant="destructive" className="mb-6 border-destructive/40">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>We couldn&apos;t cancel this order</AlertTitle>
            <AlertDescription>{cancelError}</AlertDescription>
          </Alert>
        )}

        <section
          aria-label="Order status"
          className="mb-6 rounded-xl border border-border/60 bg-card p-4 text-card-foreground sm:p-5"
        >
          {cancelled ? (
            <p className="flex items-center gap-2 text-sm">
              <CircleXIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              This order was cancelled.
            </p>
          ) : (
            <>
              <OrderProgress status={order.status} />
              <p className="mt-4 text-sm text-muted-foreground">{statusMessage(order)}</p>
            </>
          )}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section
            aria-labelledby="order-items-heading"
            className="min-w-0 rounded-xl border border-border/60 bg-card text-card-foreground lg:self-start"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
              <h2 id="order-items-heading" className="text-sm font-semibold">
                Items
              </h2>
              {order.shop && (
                <Link
                  route="stores.show"
                  routeParams={{ slug: order.shop.slug }}
                  className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  <StoreIcon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{order.shop.name}</span>
                </Link>
              )}
            </div>
            <div className="px-4">
              <OrderItemsList items={order.items} />
            </div>
            <div className="border-t border-border/60 px-4 py-4">
              <PriceRows
                subtotalMinor={order.subtotalMinor}
                shippingMinor={order.shippingTotalMinor}
                discountMinor={order.discountTotalMinor}
                totalMinor={order.grandTotalMinor}
              />
            </div>
          </section>

          <div className="min-w-0 space-y-4">
            {order.shippingAddress && (
              <section className="rounded-xl border border-border/60 bg-card p-4">
                <h2 className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <MapPinIcon className="size-3.5" aria-hidden="true" />
                  Delivery address
                </h2>
                <AddressBlock address={order.shippingAddress} />
              </section>
            )}

            <section className="rounded-xl border border-border/60 bg-card p-4">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <BanknoteIcon className="size-3.5" aria-hidden="true" />
                Payment
              </h2>
              <p className="text-sm font-medium">{order.paymentMethod}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{paymentMessage(order)}</p>
            </section>

            {order.notes && (
              <section className="rounded-xl border border-border/60 bg-card p-4">
                <h2 className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <StickyNoteIcon className="size-3.5" aria-hidden="true" />
                  Your note
                </h2>
                <p className="text-sm whitespace-pre-line">{order.notes}</p>
              </section>
            )}

            {hasContact(support) && (
              <section className="rounded-xl border border-border/60 bg-card p-4">
                <h2 className="text-sm font-semibold">Need help with this order?</h2>
                <p className="mt-0.5 mb-3 text-sm text-muted-foreground">
                  Message or call us with your order number.
                </p>
                <ContactOptions
                  className="sm:grid-cols-1"
                  message={`Hi, I have a question about order ${order.orderNumber}.`}
                />
              </section>
            )}
          </div>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={(open) => !cancelling && setConfirming(open)}>
        <DialogContent showCloseButton={!cancelling}>
          <DialogHeader>
            <DialogTitle>Cancel order {order.orderNumber}?</DialogTitle>
            <DialogDescription>
              {order.shop?.name ?? 'The shop'} hasn&apos;t confirmed it yet, so you can still
              cancel. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={cancelling}>
                Keep order
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={cancelOrder} disabled={cancelling}>
              {cancelling && <Spinner className="size-4" />}
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

AccountOrderPage.layout = [RootLayout, CustomersLayout]
