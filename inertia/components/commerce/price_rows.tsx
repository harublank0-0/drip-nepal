import type { ReactNode } from 'react'
import { formatNPR } from '@shared/format/money'
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

export function deliveryFee(amountMinor: number) {
  return amountMinor === 0 ? 'Free' : formatNPR(amountMinor)
}

type PriceRowsProps = {
  subtotalMinor: number
  subtotalLabel?: ReactNode
  shippingMinor: number
  shippingLabel?: ReactNode
  discountMinor?: number
  totalMinor: number
  totalLabel?: ReactNode
  className?: string
}

/*
 * Subtotal, delivery, discount and total, for the cart, checkout and
 * order summaries. Amounts are paisa.
 */
export function PriceRows({
  subtotalMinor,
  subtotalLabel = 'Subtotal',
  shippingMinor,
  shippingLabel = 'Delivery',
  discountMinor = 0,
  totalMinor,
  totalLabel = 'Total',
  className,
}: PriceRowsProps) {
  return (
    <dl className={cn('space-y-2 text-sm', className)}>
      <PriceRow label={subtotalLabel} value={formatNPR(subtotalMinor)} />
      <PriceRow label={shippingLabel} value={deliveryFee(shippingMinor)} />
      {discountMinor > 0 && <PriceRow label="Discount" value={`− ${formatNPR(discountMinor)}`} />}
      <div className="flex items-baseline justify-between gap-4 border-t border-border/60 pt-3">
        <dt className="font-semibold">{totalLabel}</dt>
        <dd className="text-base font-semibold tabular-nums">{formatNPR(totalMinor)}</dd>
      </div>
    </dl>
  )
}
