import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Lock, RotateCcw, Package, Shield, HelpCircle } from 'lucide-react'
import { Link } from '@adonisjs/inertia/react'
import { Button } from '~/components/ui/button'
import { useCart } from '~/hooks/use_cart'
import { MOCK_CART_ITEMS } from '~/lib/mock-data/cart'
import {
  MOCK_ADDRESSES,
  MOCK_DELIVERY_METHODS,
  MOCK_STORE_DELIVERY_METHODS,
  MOCK_PAYMENT_METHODS,
  TAX_RATE,
  MOCK_COUPONS,
} from '~/lib/mock-data/checkout'
import { CheckoutStepper } from './checkout_stepper'
import { AddressStep } from './address_step'
import { DeliveryStep } from './delivery_step'
import { PaymentStep } from './payment_step'
import { ReviewStep } from './review_step'
import { OrderSummary } from './order_summary'
import { CouponSection } from './coupon_section'
import { OrderSuccessPage } from './order_success_page'
import {
  AddressSkeleton,
  DeliverySkeleton,
  PaymentSkeleton,
  SummarySkeleton,
} from './checkout_skeleton'
import type {
  CheckoutStep,
  Address,
  DeliveryMethod,
  AddressFormData,
  OrderConfirmation,
  OrderItem,
} from '~/types/checkout'

const STEP_ORDER: CheckoutStep[] = ['address', 'delivery', 'payment', 'review']

const STEP_TITLES: Record<CheckoutStep, string> = {
  address: 'Address',
  delivery: 'Delivery',
  payment: 'Payment',
  review: 'Review',
}

export function CheckoutPage() {
  const {
    state: cartState,
    dispatch,
    itemCount,
    subtotal,
    groupedItems,
    applyCoupon,
    removeCoupon,
  } = useCart()

  const { items: cartItems, coupon } = cartState

  const seeded = useRef(false)
  useEffect(() => {
    if (!seeded.current && cartItems.length === 0 && MOCK_CART_ITEMS.length > 0) {
      seeded.current = true
      dispatch({ type: 'SET_ITEMS', payload: MOCK_CART_ITEMS })
    }
  }, [dispatch, cartItems.length])

  const [step, setStep] = useState<CheckoutStep>('address')
  const [addresses, setAddresses] = useState<Address[]>(MOCK_ADDRESSES)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    MOCK_ADDRESSES[0]?.id ?? null
  )
  const [selectedDeliveryMethodId, setSelectedDeliveryMethodId] = useState<string | null>(null)
  const [storeDeliverySelections, setStoreDeliverySelections] = useState<Record<string, string>>({})
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null)
  const [localCoupon, setLocalCoupon] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600)
    return () => clearTimeout(timer)
  }, [])

  const isEmpty = cartItems.length === 0

  // Load initial suggested delivery methods
  useEffect(() => {
    if (!isLoading && !selectedDeliveryMethodId && MOCK_DELIVERY_METHODS.length > 0) {
      setSelectedDeliveryMethodId(MOCK_DELIVERY_METHODS[0].id)
    }
  }, [isLoading, selectedDeliveryMethodId])

  // Multi-vendor: auto-select first method for each store
  useEffect(() => {
    if (!isLoading) {
      const initial: Record<string, string> = {}
      for (const group of groupedItems) {
        const storeMethods = MOCK_STORE_DELIVERY_METHODS[group.storeId]
        if (storeMethods && storeMethods.length > 0 && !storeDeliverySelections[group.storeId]) {
          initial[group.storeId] = storeMethods[0].id
        }
      }
      if (Object.keys(initial).length > 0) {
        setStoreDeliverySelections((prev) => ({ ...prev, ...initial }))
      }
    }
  }, [isLoading, groupedItems, storeDeliverySelections])

  // Decide if we use per-store delivery or platform delivery
  const usesStoreDelivery = useMemo(() => {
    return groupedItems.some((g) => MOCK_STORE_DELIVERY_METHODS[g.storeId]?.length > 0)
  }, [groupedItems])

  // Compute delivery costs
  const deliveryTotal = useMemo(() => {
    if (usesStoreDelivery) {
      let total = 0
      for (const group of groupedItems) {
        const methodId = storeDeliverySelections[group.storeId]
        if (methodId) {
          const methods = MOCK_STORE_DELIVERY_METHODS[group.storeId] || []
          const method = methods.find((m) => m.id === methodId)
          if (method) total += method.price
        }
      }
      return total
    }
    const method = MOCK_DELIVERY_METHODS.find((m) => m.id === selectedDeliveryMethodId)
    return method?.price ?? 0
  }, [usesStoreDelivery, groupedItems, storeDeliverySelections, selectedDeliveryMethodId])

  const appliedCoupon = coupon || localCoupon
  const couponDiscountPercent = appliedCoupon
    ? (MOCK_COUPONS.find((c) => c.code === appliedCoupon)?.discountPercent ?? 0)
    : 0
  const couponDiscountValue =
    couponDiscountPercent > 0 ? (subtotal * couponDiscountPercent) / 100 : 0
  const tax = Math.round((subtotal + deliveryTotal - couponDiscountValue) * TAX_RATE)
  const grandTotal = subtotal + deliveryTotal - couponDiscountValue + tax

  const handleApplyCoupon = (code: string) => {
    setLocalCoupon(code)
    applyCoupon(code)
  }

  const handleRemoveCoupon = () => {
    setLocalCoupon(null)
    removeCoupon()
  }

  const canProceed = (): boolean => {
    switch (step) {
      case 'address':
        return selectedAddressId !== null
      case 'delivery':
        if (usesStoreDelivery) {
          return groupedItems.every((g) => storeDeliverySelections[g.storeId])
        }
        return selectedDeliveryMethodId !== null
      case 'payment':
        return selectedPaymentMethodId !== null
      case 'review':
        return true
    }
  }

  const nextStep = () => {
    const idx = STEP_ORDER.indexOf(step)
    if (idx < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[idx + 1])
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const prevStep = () => {
    const idx = STEP_ORDER.indexOf(step)
    if (idx > 0) {
      setStep(STEP_ORDER[idx - 1])
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleAddAddress = (data: AddressFormData) => {
    const newAddress: Address = {
      id: `addr-${Date.now()}`,
      fullName: data.fullName,
      phoneNumber: data.phoneNumber,
      province: data.province,
      district: data.district,
      city: data.city,
      area: data.area,
      landmark: data.landmark || undefined,
      postalCode: data.postalCode || undefined,
      isDefault: data.isDefault,
      label: data.label,
    }
    setAddresses((prev) => [...prev, newAddress])
    setSelectedAddressId(newAddress.id)
  }

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null
  const selectedDeliveryMethod =
    MOCK_DELIVERY_METHODS.find((m) => m.id === selectedDeliveryMethodId) ?? null
  const selectedPaymentMethod =
    MOCK_PAYMENT_METHODS.find((m) => m.id === selectedPaymentMethodId) ?? null

  // Resolve store-specific delivery methods
  const resolvedStoreDeliveryMethods = useMemo(() => {
    const result: Record<string, DeliveryMethod | null> = {}
    for (const group of groupedItems) {
      const storeMethods = MOCK_STORE_DELIVERY_METHODS[group.storeId]
      const selectedId = storeDeliverySelections[group.storeId]
      if (storeMethods && selectedId) {
        result[group.storeId] = storeMethods.find((m) => m.id === selectedId) ?? null
      }
    }
    return result
  }, [groupedItems, storeDeliverySelections])

  const handlePlaceOrder = () => {
    setIsPlacingOrder(true)
    setTimeout(() => {
      const orderItems: OrderItem[] = cartItems.map((item) => ({
        id: item.id,
        name: item.name,
        image: item.image,
        price: item.price,
        quantity: item.quantity,
        color: item.color,
        size: item.size,
        storeId: item.storeId,
        storeName: item.storeName,
      }))

      const orderNumber = `DN-${Date.now().toString(36).toUpperCase()}`
      const estimatedDate = usesStoreDelivery
        ? Object.values(resolvedStoreDeliveryMethods)
            .filter(Boolean)
            .map((m) => m!.estimatedDate)
            .join(', ')
        : (selectedDeliveryMethod?.estimatedDate ?? '')

      setOrderConfirmation({
        orderNumber,
        estimatedDelivery: estimatedDate,
        items: orderItems,
        shippingAddress: selectedAddress!,
        deliveryMethod:
          selectedDeliveryMethod ||
          resolvedStoreDeliveryMethods[groupedItems[0]?.storeId] ||
          MOCK_DELIVERY_METHODS[0],
        paymentMethod: selectedPaymentMethod!,
        subtotal,
        shipping: deliveryTotal,
        discount: couponDiscountValue,
        tax,
        total: grandTotal,
      })
      setIsPlacingOrder(false)
      dispatch({ type: 'CLEAR_CART' })
    }, 1500)
  }

  const stores = useMemo(
    () => groupedItems.map((g) => ({ id: g.storeId, name: g.storeName })),
    [groupedItems]
  )

  // Empty cart state
  if (!isPlacingOrder && !orderConfirmation && isEmpty) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Package className="mx-auto size-12 text-muted-foreground/50" />
        <h2 className="mt-4 text-lg font-semibold font-heading">Your cart is empty</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add some items to your cart before checking out.
        </p>
        <Button size="lg" className="mt-6 rounded-xl" asChild>
          <Link href="/">Continue Shopping</Link>
        </Button>
      </div>
    )
  }

  // Success state
  if (orderConfirmation) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <OrderSuccessPage order={orderConfirmation} />
      </div>
    )
  }

  const stepIndex = STEP_ORDER.indexOf(step)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 pb-28 lg:pb-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <li>
            <Link href="/cart" className="hover:text-foreground transition-colors">
              Cart
            </Link>
          </li>
          <span className="text-muted-foreground/40">/</span>
          <li className="text-foreground font-medium">Checkout</li>
        </ol>
      </nav>

      {/* Stepper */}
      <CheckoutStepper currentStep={step} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left Column — Steps */}
        <div className="min-w-0">
          <div className="rounded-xl border border-border/50 bg-card p-5">
            {/* Step Content */}
            {isLoading ? (
              <div className="space-y-4">
                {step === 'address' && <AddressSkeleton />}
                {step === 'delivery' && <DeliverySkeleton />}
                {step === 'payment' && <PaymentSkeleton />}
                {step === 'review' && <SummarySkeleton />}
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                >
                  {step === 'address' && (
                    <AddressStep
                      addresses={addresses}
                      selectedAddressId={selectedAddressId}
                      onSelect={setSelectedAddressId}
                      onAddAddress={handleAddAddress}
                      isLoading={false}
                    />
                  )}
                  {step === 'delivery' && (
                    <DeliveryStep
                      methods={MOCK_DELIVERY_METHODS}
                      storeMethods={MOCK_STORE_DELIVERY_METHODS}
                      selectedMethodId={selectedDeliveryMethodId}
                      storeSelections={storeDeliverySelections}
                      onSelect={setSelectedDeliveryMethodId}
                      onStoreSelect={(storeId, methodId) =>
                        setStoreDeliverySelections((prev) => ({ ...prev, [storeId]: methodId }))
                      }
                      isLoading={false}
                      stores={stores}
                    />
                  )}
                  {step === 'payment' && (
                    <PaymentStep
                      methods={MOCK_PAYMENT_METHODS}
                      selectedMethodId={selectedPaymentMethodId}
                      onSelect={setSelectedPaymentMethodId}
                      isLoading={false}
                    />
                  )}
                  {step === 'review' && (
                    <ReviewStep
                      address={selectedAddress}
                      deliveryMethod={selectedDeliveryMethod}
                      storeDeliveryMethods={resolvedStoreDeliveryMethods}
                      paymentMethod={selectedPaymentMethod}
                      groupedItems={groupedItems}
                      stores={stores}
                      onEditAddress={() => setStep('address')}
                      onEditDelivery={() => setStep('delivery')}
                      onEditPayment={() => setStep('payment')}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}

            {/* Navigation Buttons (desktop) */}
            {!isLoading && (
              <div className="mt-8 hidden items-center justify-between lg:flex">
                <div>
                  {stepIndex > 0 && (
                    <Button variant="ghost" onClick={prevStep} className="gap-1.5 text-sm">
                      <ArrowLeft className="size-4" />
                      Back
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {step !== 'review' && (
                    <Button
                      size="lg"
                      onClick={nextStep}
                      disabled={!canProceed()}
                      className="gap-1.5 rounded-xl h-10 text-sm"
                    >
                      Continue
                      <ArrowRight className="size-4" />
                    </Button>
                  )}
                  {step === 'review' && (
                    <Button
                      size="lg"
                      onClick={handlePlaceOrder}
                      disabled={isPlacingOrder}
                      className="gap-2 rounded-xl h-10 text-sm min-w-[160px]"
                    >
                      {isPlacingOrder ? (
                        <>
                          <RotateCcw className="size-4 animate-spin" />
                          Placing Order...
                        </>
                      ) : (
                        <>
                          <Lock className="size-4" />
                          Place Order
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Coupon Section (below card) */}
          {!isLoading && step !== 'address' && (
            <div className="mt-4">
              <CouponSection
                coupon={appliedCoupon}
                onApplyCoupon={handleApplyCoupon}
                onRemoveCoupon={handleRemoveCoupon}
              />
            </div>
          )}

          {/* Trust badges */}
          {!isLoading && step !== 'review' && (
            <div className="mt-8 hidden grid-cols-2 gap-4 sm:grid lg:hidden">
              <TrustBadge icon={<Shield className="size-4" />} text="Secure Checkout" />
              <TrustBadge icon={<RotateCcw className="size-4" />} text="Easy Returns" />
              <TrustBadge icon={<Package className="size-4" />} text="Cash on Delivery" />
              <TrustBadge icon={<HelpCircle className="size-4" />} text="24/7 Support" />
            </div>
          )}
        </div>

        {/* Right Column — Order Summary */}
        <div className="lg:sticky lg:top-24 lg:self-start min-w-0">
          {isLoading ? (
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <SummarySkeleton />
            </div>
          ) : (
            <>
              <OrderSummary
                subtotal={subtotal}
                shipping={deliveryTotal}
                discount={couponDiscountValue}
                tax={tax}
                total={grandTotal}
                itemCount={itemCount}
                items={cartItems}
              />

              {/* Desktop trust badges */}
              <div className="mt-6 hidden lg:block">
                <div className="space-y-3">
                  <TrustBadge icon={<Shield className="size-4" />} text="Secure Checkout" />
                  <TrustBadge icon={<RotateCcw className="size-4" />} text="Easy Returns" />
                  <TrustBadge
                    icon={<Package className="size-4" />}
                    text="Cash on Delivery Available"
                  />
                  <TrustBadge
                    icon={<HelpCircle className="size-4" />}
                    text="24/7 Customer Support"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile sticky bottom bar */}
      {!isLoading && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background p-4 lg:hidden">
          <div className="mx-auto max-w-lg">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {STEP_TITLES[step]} &middot; Step {stepIndex + 1} of 4
              </span>
              <span className="text-sm font-semibold tabular-nums">
                Rs. {grandTotal.toLocaleString('ne-NP')}
              </span>
            </div>

            <div className="flex gap-3">
              {stepIndex > 0 && (
                <Button
                  variant="outline"
                  onClick={prevStep}
                  className="h-11 w-20 shrink-0 rounded-xl"
                  aria-label="Go back"
                >
                  <ArrowLeft className="size-4" />
                </Button>
              )}

              {step !== 'review' ? (
                <Button
                  size="lg"
                  onClick={nextStep}
                  disabled={!canProceed()}
                  className="flex-1 gap-1.5 rounded-xl h-11 text-sm"
                >
                  Continue
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={handlePlaceOrder}
                  disabled={isPlacingOrder}
                  className="flex-1 gap-2 rounded-xl h-11 text-sm"
                >
                  {isPlacingOrder ? (
                    <>
                      <RotateCcw className="size-4 animate-spin" />
                      Placing...
                    </>
                  ) : (
                    <>
                      <Lock className="size-4" />
                      Place Order
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TrustBadge({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="text-muted-foreground/70">{icon}</span>
      <span>{text}</span>
    </div>
  )
}
