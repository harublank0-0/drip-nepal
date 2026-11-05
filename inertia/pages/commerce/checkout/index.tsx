import { useRef, useState, type FormEvent } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { AlertCircleIcon, ArrowLeftIcon, BanknoteIcon, LockIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import CustomersLayout from '~/layouts/customers_layout'
import {
  ADDRESS_FIELDS,
  addressFieldId,
  addressPayload,
  emptyAddress,
  type AddressFields,
} from '~/components/commerce/checkout/address_form'
import { AddressSection, type AddressMode } from '~/components/commerce/checkout/address_section'
import { CheckoutReview } from '~/components/commerce/checkout/checkout_review'
import { CheckoutSection } from '~/components/commerce/checkout/checkout_section'
import { PriceRows } from '~/components/commerce/price_rows'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { Textarea } from '~/components/ui/textarea'
import { formatNPR } from '@shared/format/money'
import { CHECKOUT_URL, orderableQuantity, pluralize } from '~/lib/order'
import type { InertiaProps } from '~/types'

type PageProps = InertiaProps<{
  cart: Data.CartSummary
  addresses: Data.Address[]
}>

const NOTES_MAX = 500

/*
 * What the customer entered, kept in this page's browser history entry
 * when they place the order, so coming back to the page (with Back, or
 * "Try again" after a failed order) shows it again. Kept once per attempt,
 * not per keystroke: browsers limit history writes (Safari: 100 per 30 s).
 * Shared devices: checkout history is encrypted from M0 (RF-34, docs/03
 * §6.3 and §12.2).
 */
const REMEMBERED_FORM = 'checkout.form'
type RememberedForm = {
  mode: AddressMode
  addressId: string
  address: AddressFields
  notes: string
}

function errorText(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

export default function CheckoutPage({ cart, addresses }: PageProps) {
  const { errors, user } = usePage<Data.SharedProps>().props
  const guest = !user

  // Nothing on the server or on a first visit; the last attempt's entries
  // when the customer comes back to this history entry.
  const [remembered] = useState(() => router.restore(REMEMBERED_FORM) as RememberedForm | undefined)
  const [mode, setMode] = useState<AddressMode>(
    remembered?.mode ?? (addresses.length > 0 ? 'saved' : 'new')
  )
  const [addressId, setAddressId] = useState(remembered?.addressId ?? addresses[0]?.id ?? '')
  const [address, setAddress] = useState<AddressFields>(
    () => remembered?.address ?? emptyAddress(user?.fullName ?? '')
  )
  const [notes, setNotes] = useState(remembered?.notes ?? '')
  const [processing, setProcessing] = useState(false)
  /* Fields changed since the last attempt: their old errors no longer apply. */
  const [edited, setEdited] = useState<string[]>([])
  const problemRef = useRef<HTMLDivElement>(null)

  const fieldErrors = Object.fromEntries(
    Object.entries((errors ?? {}) as Record<string, unknown>).filter(
      ([field]) => !edited.includes(field)
    )
  )
  const markEdited = (...fields: string[]) =>
    setEdited((current) => [...new Set([...current, ...fields])])

  const cartError = errorText(fieldErrors?.cart)
  const notesError = errorText(fieldErrors?.notes)
  const blocked = cart.hasUnavailableItems
  const packages = cart.shops.filter((group) => group.subtotalMinor > 0)
  const orderable = orderableQuantity(cart.shops.flatMap((group) => group.items))
  const canSubmit = !blocked && !processing && (mode === 'new' || addressId !== '')

  /* Bring the first problem into view so it isn't missed below the fold. */
  const focusFirstError = (found: Record<string, unknown>) => {
    if ('cart' in found) {
      problemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      problemRef.current?.focus({ preventScroll: true })
      return
    }
    const field = ADDRESS_FIELDS.find((name) => `address.${name}` in found)
    const id = field ? addressFieldId(field) : 'notes' in found ? 'checkout-notes' : null
    const element = id ? document.getElementById(id) : null
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element?.focus({ preventScroll: true })
  }

  const placeOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    const destination = mode === 'saved' ? { addressId } : { address: addressPayload(address) }
    router.post(
      CHECKOUT_URL,
      { ...destination, notes: notes.trim() || undefined },
      {
        // Stay put on validation errors; start at the top of the success page.
        preserveScroll: 'errors',
        preserveState: 'errors',
        onStart: () => {
          router.remember(
            { mode, addressId, address, notes } satisfies RememberedForm,
            REMEMBERED_FORM
          )
          setProcessing(true)
          setEdited([])
        },
        onFinish: () => setProcessing(false),
        onError: focusFirstError,
      }
    )
  }

  const placeOrderButton = (className: string) => (
    <Button type="submit" size="lg" className={className} disabled={!canSubmit}>
      {processing ? (
        <>
          <Spinner className="size-4" />
          Placing order…
        </>
      ) : (
        <>
          <LockIcon className="size-4" aria-hidden="true" />
          Place order
        </>
      )}
    </Button>
  )

  return (
    <>
      <Head title="Checkout" />
      <form onSubmit={placeOrder} noValidate aria-busy={processing}>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:pb-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-heading text-2xl font-semibold sm:text-3xl">Checkout</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {pluralize(cart.itemCount, 'item')} · Cash on delivery
              </p>
            </div>
            <Link
              route="cart.show"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" aria-hidden="true" />
              Back to cart
            </Link>
          </div>

          {guest && (
            <p className="mb-6 rounded-xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
              Checking out as a guest. No account needed.{' '}
              <a href="/auth/login?next=/checkout" className="text-foreground underline">
                Log in
              </a>{' '}
              to use your saved addresses.
            </p>
          )}

          {(cartError || blocked) && (
            <Alert
              ref={problemRef}
              tabIndex={-1}
              variant="destructive"
              className="mb-6 border-destructive/40 outline-none"
            >
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>
                {cartError ?? 'Some items in your cart can’t be ordered right now'}
              </AlertTitle>
              <AlertDescription>
                <p>
                  Remove them or lower the quantity in your cart, then come back to place your
                  order. <Link route="cart.show">Go to cart</Link>
                </p>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
            <div className="min-w-0 space-y-6">
              <CheckoutSection
                id="checkout-address"
                step={1}
                title="Delivery address"
                description={
                  addresses.length === 0 && !guest
                    ? 'Where should we deliver? We’ll save it for next time.'
                    : 'Where should we deliver?'
                }
              >
                <AddressSection
                  guest={guest}
                  addresses={addresses}
                  mode={mode}
                  addressId={addressId}
                  address={address}
                  errors={fieldErrors}
                  onPickSaved={(id) => {
                    setMode('saved')
                    setAddressId(id)
                    markEdited('addressId')
                  }}
                  onPickNew={() => {
                    setMode('new')
                    markEdited('addressId')
                  }}
                  onAddressChange={(patch) => {
                    setAddress((current) => ({ ...current, ...patch }))
                    markEdited(...Object.keys(patch).map((field) => `address.${field}`))
                  }}
                />
              </CheckoutSection>

              <CheckoutSection
                id="checkout-items"
                step={2}
                title="Review items"
                description={
                  packages.length > 1
                    ? `Your items come from ${packages.length} shops. Each shop sends its own package, so you’ll get ${packages.length} orders.`
                    : undefined
                }
              >
                <CheckoutReview cart={cart} />
              </CheckoutSection>

              <CheckoutSection id="checkout-notes-section" step={3} title="Order notes">
                <Field data-invalid={!!notesError}>
                  <FieldLabel htmlFor="checkout-notes">
                    Anything the shop should know?{' '}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <Textarea
                    id="checkout-notes"
                    value={notes}
                    onChange={(event) => {
                      setNotes(event.target.value)
                      markEdited('notes')
                    }}
                    maxLength={NOTES_MAX}
                    rows={3}
                    placeholder="e.g. Call before delivery, leave it with the guard"
                    aria-invalid={notesError ? true : undefined}
                    aria-describedby="checkout-notes-hint"
                  />
                  {notesError ? (
                    <FieldError id="checkout-notes-hint">{notesError}</FieldError>
                  ) : (
                    <FieldDescription id="checkout-notes-hint" className="text-xs">
                      {packages.length > 1 ? 'Every shop in this order sees this note. ' : ''}
                      {notes.length}/{NOTES_MAX}
                    </FieldDescription>
                  )}
                </Field>
              </CheckoutSection>

              <CheckoutSection id="checkout-payment" step={4} title="Payment">
                <div className="flex gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
                  <BanknoteIcon
                    className="mt-0.5 size-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">Cash on delivery</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {packages.length > 1
                        ? 'Pay in cash as each package arrives:'
                        : 'Pay in cash when your order arrives.'}
                    </p>
                    {packages.length > 1 && (
                      <ul className="mt-2 space-y-1">
                        {packages.map((group) => (
                          <li key={group.shop.id} className="flex justify-between gap-4">
                            <span className="truncate text-muted-foreground">
                              {group.shop.name}
                            </span>
                            <span className="tabular-nums">
                              {formatNPR(group.subtotalMinor + group.shippingMinor)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </CheckoutSection>
            </div>

            <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
              <section
                aria-labelledby="checkout-summary-heading"
                className="rounded-xl border border-border/60 bg-card p-5 text-card-foreground"
              >
                <h2
                  id="checkout-summary-heading"
                  className="mb-4 font-heading text-lg font-semibold"
                >
                  Order summary
                </h2>
                <PriceRows
                  subtotalMinor={cart.subtotalMinor}
                  subtotalLabel={`Subtotal (${pluralize(orderable, 'item')})`}
                  shippingMinor={cart.shippingTotalMinor}
                  shippingLabel={
                    packages.length > 1 ? `Delivery (${packages.length} shops)` : 'Delivery'
                  }
                  totalMinor={cart.totalMinor}
                  totalLabel="To pay on delivery"
                />
                <div className="mt-5 hidden lg:block">
                  {placeOrderButton('h-11 w-full rounded-xl')}
                </div>
                <p className="mt-3 hidden text-center text-xs text-muted-foreground lg:block">
                  You pay nothing now. Pay in cash on delivery.
                </p>
              </section>
            </aside>
          </div>
        </div>

        {/* Place order bar for small screens, where the summary sits below the form. */}
        <div className="sticky bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">To pay on delivery</p>
              <p className="text-base font-semibold tabular-nums">{formatNPR(cart.totalMinor)}</p>
            </div>
            {placeOrderButton('h-11 flex-1 rounded-xl')}
          </div>
        </div>
      </form>
    </>
  )
}

CheckoutPage.layout = [RootLayout, CustomersLayout]
