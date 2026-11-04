import { formatPrice } from '~/lib/format'
import { cn, getDiscountPercentage } from '~/lib/utils'
import type { PriceSummary } from '../hooks/use_variant_selection'

type PriceTagProps = {
  price: PriceSummary | null
  size?: 'sm' | 'lg'
  className?: string
}

export function PriceTag({ price, size = 'lg', className }: PriceTagProps) {
  if (!price) return null

  const { comparePrice } = price
  const hasDiscount = comparePrice !== null && comparePrice > price.price
  const discount = hasDiscount ? getDiscountPercentage(comparePrice, price.price) : 0

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
        {formatPrice(price.price)}
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
            {formatPrice(comparePrice)}
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
