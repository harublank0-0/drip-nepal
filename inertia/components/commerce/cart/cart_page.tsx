import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { ScrollArea } from '~/components/ui/scroll_area'
import { useCart } from '~/hooks/use_cart'
import { CartItem } from './cart_item'
import { CartStoreGroup } from './cart_store_group'
import { OrderSummary } from './order_summary'
import { CouponSection } from './coupon_section'
import { DeliveryInfo } from './delivery_info'
import { SavedItems } from './saved_items'
import { FreeShippingProgress } from './free_shipping_progress'
import { Recommendations } from './recommendations'
import { EmptyCart } from './empty_cart'
import { CartItemSkeleton, SummarySkeleton, RecommendationSkeleton } from './cart_skeleton'
import { Link } from '@adonisjs/inertia/react'
import { MOCK_CART_ITEMS } from '~/lib/mock-data/cart'

export function CartPage() {
  const {
    state,
    dispatch,
    removeItem,
    updateQuantity,
    saveForLater,
    moveToCart,
    removeSaved,
    applyCoupon,
    removeCoupon,
    itemCount,
    subtotal,
    shipping,
    discount,
    total,
    freeShippingRemaining,
    groupedItems,
    savedCount,
  } = useCart()

  const { items, savedItems, isLoading, isUpdating, coupon } = state

  const seeded = useRef(false)
  useEffect(() => {
    if (!seeded.current && items.length === 0 && MOCK_CART_ITEMS.length > 0) {
      seeded.current = true
      dispatch({ type: 'SET_ITEMS', payload: MOCK_CART_ITEMS })
    }
  }, [dispatch, items.length])

  const isEmpty = items.length === 0

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <CartItemSkeleton key={i} />
            ))}
          </div>
          <div className="lg:sticky lg:top-24 lg:self-start min-w-0">
            <SummarySkeleton />
            <div className="mt-8">
              <RecommendationSkeleton />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <EmptyCart variant="page" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 pb-24 lg:pb-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <li>
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
          </li>
          <span className="text-muted-foreground/40">/</span>
          <li className="text-foreground font-medium">Cart</li>
        </ol>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left Column — Cart Items */}
        <div className="min-w-0">
          {/* Free Shipping Progress */}
          {freeShippingRemaining > 0 && (
            <div className="mb-6">
              <FreeShippingProgress subtotal={subtotal} remaining={freeShippingRemaining} />
            </div>
          )}

          {/* Cart Items Grouped by Store */}
          <div className="divide-y divide-border/30">
            {groupedItems.map((group) => (
              <CartStoreGroup key={group.storeId} group={group}>
                {(item) => (
                  <CartItem
                    item={item}
                    onUpdateQuantity={updateQuantity}
                    onRemove={removeItem}
                    onSaveForLater={saveForLater}
                    isLoading={isUpdating[item.id]}
                  />
                )}
              </CartStoreGroup>
            ))}
          </div>

          <Separator className="my-6" />

          {/* Coupon Section */}
          <CouponSection
            coupon={coupon}
            onApplyCoupon={applyCoupon}
            onRemoveCoupon={removeCoupon}
          />

          {/* Delivery Information */}
          <div className="mt-6">
            <DeliveryInfo />
          </div>

          {/* Saved Items */}
          <SavedItems items={savedItems} onMoveToCart={moveToCart} onRemove={removeSaved} />

          {/* Recommendations */}
          <div className="mt-8">
            <Recommendations variant="page" />
          </div>

          {/* Recently Viewed (placeholder) */}
          <div className="mt-8">
            <Recommendations title="Recently Viewed" variant="page" />
          </div>
        </div>

        {/* Right Column — Order Summary */}
        <div className="lg:sticky lg:top-24 lg:self-start min-w-0">
          <div className="rounded-xl border border-border/50 bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">Order Summary</h3>
            <OrderSummary
              subtotal={subtotal}
              shipping={shipping}
              discount={discount}
              total={total}
              itemCount={itemCount}
              showCheckoutButton
              showViewCartButton={false}
              variant="page"
            />
          </div>
        </div>
      </div>

      {/* Mobile sticky checkout */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border/50 bg-background p-4 lg:hidden">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-base font-semibold tabular-nums">
              Rs. {total.toLocaleString('ne-NP')}
            </span>
          </div>
          <Button size="lg" className="w-full h-11 text-sm font-medium rounded-xl">
            Proceed to Checkout
          </Button>
        </div>
      </div>
    </div>
  )
}
