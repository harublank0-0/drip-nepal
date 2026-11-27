import { formatNPR } from '@shared/format/money'
import { t } from '~/lib/i18n'

type Money = { amount_minor: number; currency: string }

/*
 * A price as the storefront shows it (docs/08 §4 `PriceTag`, §5.11): one
 * amount, or "Rs 1,299 – Rs 1,599" for a range, formatted by `formatNPR`
 * only; a compare-at price struck through and announced as "was …".
 */
export function PriceTag({
  min,
  max,
  compareAt,
}: {
  min: Money
  max?: Money | null
  compareAt?: Money | null
}) {
  const range = max && max.amount_minor !== min.amount_minor
  const price = range
    ? t('storefront.price.range', {
        min: formatNPR(min.amount_minor),
        max: formatNPR(max.amount_minor),
      })
    : formatNPR(min.amount_minor)
  const was = compareAt && compareAt.amount_minor > min.amount_minor ? compareAt : null
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className="font-semibold tabular-nums">{price}</span>
      {was ? (
        <s className="text-muted-foreground text-sm tabular-nums">
          <span className="sr-only">{t('storefront.price.was', { price: '' })}</span>
          {formatNPR(was.amount_minor)}
        </s>
      ) : null}
    </span>
  )
}
