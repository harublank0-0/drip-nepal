import { useState } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { AlertCircleIcon, ArrowLeftIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import CustomersLayout from '~/layouts/customers_layout'
import { CartLine } from '~/components/commerce/cart/cart_line'
import { CartShopGroup } from '~/components/commerce/cart/cart_shop_group'
import { CartSummary } from '~/components/commerce/cart/cart_summary'
import { EmptyCart } from '~/components/commerce/cart/empty_cart'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { formatPrice } from '~/lib/format'
import { CART_ITEMS_URL, pluralize } from '~/lib/order'
import type { InertiaProps } from '~/types'

type PageProps = InertiaProps<{
  cart: Data.CartSummary
}>

function errorText(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

export default function CartPage({ cart }: PageProps) {
  const { errors } = usePage<Data.SharedProps>().props
  /* The line being saved, and the last one touched (server errors belong to it). */
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [lastEditedId, setLastEditedId] = useState<string | null>(null)

  const visitOptions = (lineId: string) => ({
    preserveScroll: true,
    preserveState: true,
    onStart: () => {
      setPendingId(lineId)
      setLastEditedId(lineId)
    },
    onFinish: () => setPendingId(null),
  })

  const updateQuantity = (lineId: string, quantity: number) => {
    router.post(`${CART_ITEMS_URL}/${lineId}`, { quantity }, visitOptions(lineId))
  }

  const removeLine = (lineId: string) => {
    router.delete(`${CART_ITEMS_URL}/${lineId}`, visitOptions(lineId))
  }

  const lineError = (lineId: string) =>
    lineId === lastEditedId ? (errorText(errors?.quantity) ?? errorText(errors?.item)) : undefined

  if (cart.shops.length === 0) {
    return (
      <>
        <Head title="Your cart" />
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <EmptyCart />
        </div>
      </>
    )
  }

  return (
    <>
      <Head title="Your cart" />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:pb-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold sm:text-3xl">Your cart</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {pluralize(cart.itemCount, 'item')} from {pluralize(cart.shops.length, 'shop')}
            </p>
          </div>
          <Link
            route="home"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            Continue shopping
          </Link>
        </div>

        {cart.hasUnavailableItems && (
          <Alert variant="destructive" className="mb-6 border-destructive/40">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>Some items can&apos;t be ordered right now</AlertTitle>
            <AlertDescription>
              Remove them or lower the quantity to check out. They aren&apos;t counted in your
              total.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <div className="min-w-0 space-y-4">
            {cart.shops.map((group) => (
              <CartShopGroup key={group.shop.id} group={group}>
                {group.items.map((line) => (
                  <li key={line.id}>
                    <CartLine
                      line={line}
                      pending={pendingId === line.id}
                      error={lineError(line.id)}
                      onQuantityChange={(quantity) => updateQuantity(line.id, quantity)}
                      onRemove={() => removeLine(line.id)}
                    />
                  </li>
                ))}
              </CartShopGroup>
            ))}
          </div>

          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <CartSummary cart={cart} />
          </aside>
        </div>
      </div>

      {/* Checkout bar for small screens, where the summary sits below the items. */}
      <div className="sticky bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-base font-semibold tabular-nums">{formatPrice(cart.total)}</p>
          </div>
          {cart.hasUnavailableItems ? (
            <Button size="lg" className="h-11 flex-1 rounded-xl" disabled>
              Checkout
            </Button>
          ) : (
            <Button size="lg" className="h-11 flex-1 rounded-xl" asChild>
              <Link route="checkout.show">Checkout</Link>
            </Button>
          )}
        </div>
      </div>
    </>
  )
}

CartPage.layout = [RootLayout, CustomersLayout]
