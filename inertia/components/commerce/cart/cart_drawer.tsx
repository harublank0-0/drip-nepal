import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, X } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '~/components/ui/sheet'
import { Button } from '~/components/ui/button'
import { ScrollArea } from '~/components/ui/scroll_area'
import { Separator } from '~/components/ui/separator'
import { useCart } from '~/hooks/use_cart'
import { CartDrawerItem } from './cart_drawer_item'
import { CartStoreGroup } from './cart_store_group'
import { FreeShippingProgress } from './free_shipping_progress'
import { OrderSummary } from './order_summary'
import { Recommendations } from './recommendations'
import { EmptyCart } from './empty_cart'
import { CartItemSkeleton, SummarySkeleton } from './cart_skeleton'
import { Link } from '@adonisjs/inertia/react'

export function CartDrawer() {
  const {
    state,
    closeDrawer,
    removeItem,
    updateQuantity,
    itemCount,
    subtotal,
    shipping,
    discount,
    total,
    freeShippingRemaining,
    groupedItems,
  } = useCart()

  const { isDrawerOpen, items, isLoading, isUpdating } = state
  const isEmpty = items.length === 0

  return (
    <Sheet open={isDrawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[420px] data-[side=right]:sm:max-w-[420px]"
      >
        <SheetHeader className="flex flex-row items-center justify-between px-4 py-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <SheetTitle className="text-sm font-semibold">
              Shopping Cart
              {itemCount > 0 && (
                <span className="text-muted-foreground font-normal ml-1">({itemCount})</span>
              )}
            </SheetTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-muted-foreground hover:text-foreground gap-1 rounded-full px-3"
              asChild
            >
              <Link href="/men" onClick={closeDrawer}>
                <ArrowLeft className="size-3" />
                Continue Shopping
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={closeDrawer}
              aria-label="Close cart"
              className="size-7"
            >
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 px-4 py-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <CartItemSkeleton key={i} />
            ))}
            <Separator className="my-4" />
            <SummarySkeleton />
          </div>
        ) : isEmpty ? (
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-4">
              <EmptyCart variant="drawer" />
            </div>
          </ScrollArea>
        ) : (
          <>
            <ScrollArea className="flex-1 min-h-0 px-4">
              {freeShippingRemaining > 0 && (
                <div className="pt-4 pb-2">
                  <FreeShippingProgress subtotal={subtotal} remaining={freeShippingRemaining} />
                </div>
              )}

              <div className="divide-y divide-border/30">
                {groupedItems.map((group) => (
                  <CartStoreGroup key={group.storeId} group={group}>
                    {(item) => (
                      <CartDrawerItem
                        item={item}
                        onUpdateQuantity={updateQuantity}
                        onRemove={removeItem}
                        isLoading={isUpdating[item.id]}
                      />
                    )}
                  </CartStoreGroup>
                ))}
              </div>

              <div className="py-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                  <span>Estimated Delivery: 2-4 business days</span>
                </div>
              </div>

              <div className="pb-4">
                <Recommendations variant="drawer" />
              </div>
            </ScrollArea>

            <div className="shrink-0 border-t border-border/50 px-4 py-4 bg-background">
              <OrderSummary
                subtotal={subtotal}
                shipping={shipping}
                discount={discount}
                total={total}
                itemCount={itemCount}
                showCheckoutButton
                showViewCartButton
                variant="drawer"
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
