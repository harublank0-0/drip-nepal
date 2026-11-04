import { Head, usePage } from '@inertiajs/react'
import { Form, Link } from '@adonisjs/inertia/react'
import { ChevronRightIcon, SearchIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import CustomersLayout from '~/layouts/customers_layout'
import { OrderStatusBadge } from '~/components/commerce/orders/order_status_badge'
import { ContactOptions, hasContact, useSupport } from '~/components/support/contact_options'
import { Button } from '~/components/ui/button'
import { Field, FieldError, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { formatDate, formatPrice } from '~/lib/format'
import type { InertiaProps } from '~/types'

type PageProps = InertiaProps<{
  /* Orders this browser placed or already looked up. */
  orders: Data.Order[]
}>

export default function TrackOrderPage({ orders }: PageProps) {
  const { user } = usePage<Data.SharedProps>().props
  const support = useSupport()

  return (
    <>
      <Head title="Track order" />
      <div className="mx-auto max-w-xl px-5 pt-8 pb-16 md:pt-14">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Track your order</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the order ID from your confirmation and the mobile number you ordered with.
        </p>

        <Form route="api.orders.track.lookup" className="mt-6 space-y-4">
          {({ errors, processing }) => (
            <>
              <Field data-invalid={!!errors.orderNumber}>
                <FieldLabel htmlFor="track-order-number">Order ID</FieldLabel>
                <Input
                  id="track-order-number"
                  name="orderNumber"
                  placeholder="DN261104-AB12C"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  className="h-12 font-mono text-base uppercase placeholder:normal-case"
                  aria-invalid={errors.orderNumber ? true : undefined}
                  aria-describedby={errors.orderNumber ? 'track-order-number-error' : undefined}
                />
                {errors.orderNumber && (
                  <FieldError id="track-order-number-error">{errors.orderNumber}</FieldError>
                )}
              </Field>

              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor="track-phone">Mobile number</FieldLabel>
                <Input
                  id="track-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="98XXXXXXXX"
                  required
                  className="h-12 text-base"
                  aria-invalid={errors.phone ? true : undefined}
                />
                {errors.phone && <FieldError>{errors.phone}</FieldError>}
              </Field>

              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-xl text-base"
                disabled={processing}
              >
                {processing ? (
                  <Spinner className="size-4" />
                ) : (
                  <SearchIcon className="size-4" aria-hidden="true" />
                )}
                Find my order
              </Button>
            </>
          )}
        </Form>

        {user && (
          <p className="mt-4 text-sm text-muted-foreground">
            Ordered with your account?{' '}
            <Link route="account.orders.index" className="text-foreground underline">
              See My orders
            </Link>
          </p>
        )}

        {orders.length > 0 && (
          <section aria-labelledby="device-orders" className="mt-10">
            <h2 id="device-orders" className="font-heading text-xl font-bold">
              Orders on this device
            </h2>
            <ul className="mt-3 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link
                    route="orders.track.show"
                    routeParams={{ orderNumber: order.orderNumber }}
                    className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-semibold">{order.orderNumber}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(order.placedAt ?? order.createdAt)} ·{' '}
                        {formatPrice(order.grandTotal)}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                    <ChevronRightIcon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasContact(support) && (
          <section className="mt-10 rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="font-heading text-lg font-bold">Lost your order ID?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Message or call us with the name and mobile number you ordered with.
            </p>
            <ContactOptions className="mt-4" message="Hi, I need help finding my order." />
          </section>
        )}
      </div>
    </>
  )
}

TrackOrderPage.layout = [RootLayout, CustomersLayout]
