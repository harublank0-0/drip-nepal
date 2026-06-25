import { useState } from 'react'
import { ChevronUp, Package } from 'lucide-react'
import { Separator } from '~/components/ui/separator'
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '~/components/ui/sheet'
import type { CartItem } from '~/types/cart'

type OrderSummaryProps = {
  subtotal: number
  shipping: number
  discount: number
  tax: number
  total: number
  itemCount: number
  items: CartItem[]
}

export function OrderSummary({
  subtotal,
  shipping,
  discount,
  tax,
  total,
  itemCount,
  items,
}: OrderSummaryProps) {
  const formatPrice = (value: number) => `Rs. ${value.toLocaleString('ne-NP')}`
  const [showMobileSummary, setShowMobileSummary] = useState(false)

  const content = (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal ({itemCount} items)</span>
          <span className="font-medium tabular-nums">{formatPrice(subtotal)}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Shipping</span>
          <span
            className={
              shipping === 0
                ? 'text-green-600 dark:text-green-400 font-medium tabular-nums'
                : 'tabular-nums'
            }
          >
            {shipping === 0 ? 'Free' : formatPrice(shipping)}
          </span>
        </div>

        {discount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Discount</span>
            <span className="text-green-600 dark:text-green-400 font-medium tabular-nums">
              -{formatPrice(discount)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Tax (13%)</span>
          <span className="tabular-nums">{formatPrice(tax)}</span>
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Total</span>
        <span className="text-base font-semibold tabular-nums">{formatPrice(total)}</span>
      </div>

      {items.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-muted-foreground">Items in your order</p>
          <div className="flex -space-x-2 overflow-hidden">
            {items.slice(0, 4).map((item) => (
              <img
                key={item.id}
                src={item.image}
                alt={item.name}
                className="size-8 rounded-full border-2 border-background bg-muted object-cover"
              />
            ))}
            {items.length > 4 && (
              <div className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
                +{items.length - 4}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:block">
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">Order Summary</h3>
          {content}
        </div>
      </div>

      {/* Mobile: Collapsible trigger */}
      <div className="block lg:hidden">
        <Sheet open={showMobileSummary} onOpenChange={setShowMobileSummary}>
          <SheetTrigger asChild>
            <button
              type="button"
              onClick={() => setShowMobileSummary(true)}
              className="flex w-full items-center justify-between rounded-xl border border-border/50 bg-card p-3 text-left"
            >
              <div className="flex items-center gap-2">
                <Package className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">
                  Rs. {total.toLocaleString('ne-NP')}
                </span>
                <ChevronUp className="size-4 text-muted-foreground" />
              </div>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Order Summary</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{content}</div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
