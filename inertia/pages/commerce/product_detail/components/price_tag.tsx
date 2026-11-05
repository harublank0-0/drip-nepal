import { formatNPR } from '@shared/format/money'
import { cn, getDiscountPercentage } from '~/lib/utils'
import type { PriceSummary } from '../hooks/use_variant_selection'

type PriceTagProps = {
  price: PriceSummary | null
  size?: 'sm' | 'lg'
  className?: string
}

export function PriceTag({ price, size = 'lg', className }: PriceTagProps) {
  if (!price) return null

  const { comparePriceMinor } = price
  const hasDiscount = comparePriceMinor !== null && comparePriceMinor > price.priceMinor
  const discount = hasDiscount ? getDiscountPercentage(comparePriceMinor, price.priceMinor) : 0

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-1', className)}>
      <span
        className={cn(
          'font-bold tabular-nums',
          size === 'lg' ? 'text-2xl md:text-3xl' : 'text-base'
        )}
      >
        {price.isFrom && (
          <span
            className={cn(
              'mr-1.5 font-normal text-muted-foreground',
              size === 'lg' ? 'text-base' : 'text-xs'
            )}
          >
            From
          </span>
        )}
        {formatNPR(price.priceMinor)}
      </span>
      {hasDiscount && (
        <>
          <span
            className={cn(
              'text-muted-foreground line-through tabular-nums',
              size === 'lg' ? 'text-base md:text-lg' : 'text-xs'
            )}
          >
            <span className="sr-only">Was </span>
            {formatNPR(comparePriceMinor)}
          </span>
          {discount > 0 && size === 'lg' && (
            <span className="rounded-md bg-primary px-2 py-0.5 text-sm font-semibold text-primary-foreground">
              {discount}% off
            </span>
          )}
        </>
      )}
    </div>
  )
}
