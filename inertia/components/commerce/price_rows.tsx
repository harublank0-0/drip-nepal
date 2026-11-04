import type { ReactNode } from 'react'
import { formatPrice } from '~/lib/format'
import { cn } from '~/lib/utils'

export function PriceRow({
  label,
  value,
  className,
}: {
  label: ReactNode
  value: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

export function deliveryFee(amount: number) {
  return amount === 0 ? 'Free' : formatPrice(amount)
}

type PriceRowsProps = {
  subtotal: number
  subtotalLabel?: ReactNode
  shipping: number
  shippingLabel?: ReactNode
  discount?: number
  total: number
  totalLabel?: ReactNode
  className?: string
}

/*
 * Subtotal, delivery, discount and total, for the cart, checkout and
 * order summaries.
 */
export function PriceRows({
  subtotal,
  subtotalLabel = 'Subtotal',
  shipping,
  shippingLabel = 'Delivery',
  discount = 0,
  total,
  totalLabel = 'Total',
  className,
}: PriceRowsProps) {
  return (
    <dl className={cn('space-y-2 text-sm', className)}>
      <PriceRow label={subtotalLabel} value={formatPrice(subtotal)} />
      <PriceRow label={shippingLabel} value={deliveryFee(shipping)} />
      {discount > 0 && <PriceRow label="Discount" value={`− ${formatPrice(discount)}`} />}
      <div className="flex items-baseline justify-between gap-4 border-t border-border/60 pt-3">
        <dt className="font-semibold">{totalLabel}</dt>
        <dd className="text-base font-semibold tabular-nums">{formatPrice(total)}</dd>
      </div>
    </dl>
  )
}
