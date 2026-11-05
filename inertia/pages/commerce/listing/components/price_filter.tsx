import { useId, useState, type SubmitEvent } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { formatNPR, NPR_DISPLAY_PREFIX } from '@shared/format/money'

type PriceFilterProps = {
  // Whole rupees, like the URL's min and max.
  bounds: { minRupees: number; maxRupees: number }
  min: number | null
  max: number | null
  onApply: (min: number | null, max: number | null) => void
}

function parsePrice(value: string) {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null
}

/*
 * Min / max price inputs. Holds the typed values locally and only applies
 * them on submit; remount it (via `key`) when the applied values change.
 */
export function PriceFilter({ bounds, min, max, onApply }: PriceFilterProps) {
  const id = useId()
  const [minValue, setMinValue] = useState(min === null ? '' : String(min))
  const [maxValue, setMaxValue] = useState(max === null ? '' : String(max))

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextMin = parsePrice(minValue)
    const nextMax = parsePrice(maxValue)
    if (nextMin !== null && nextMax !== null && nextMin > nextMax) {
      onApply(nextMax, nextMin)
      return
    }
    onApply(nextMin, nextMax)
  }

  const isUnchanged = parsePrice(minValue) === min && parsePrice(maxValue) === max

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`${id}-min`} className="text-xs font-normal text-muted-foreground">
            Min ({NPR_DISPLAY_PREFIX})
          </Label>
          <Input
            id={`${id}-min`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder="Any"
            value={minValue}
            onChange={(event) => setMinValue(event.target.value)}
            className="h-9"
          />
        </div>
        <span aria-hidden="true" className="pb-2 text-muted-foreground">
          –
        </span>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`${id}-max`} className="text-xs font-normal text-muted-foreground">
            Max ({NPR_DISPLAY_PREFIX})
          </Label>
          <Input
            id={`${id}-max`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder="Any"
            value={maxValue}
            onChange={(event) => setMaxValue(event.target.value)}
            className="h-9"
          />
        </div>
      </div>
      {bounds.maxRupees > 0 && (
        <p className="text-xs text-muted-foreground">
          Prices here range from{' '}
          <span className="whitespace-nowrap">{formatNPR(bounds.minRupees * 100)}</span> to{' '}
          <span className="whitespace-nowrap">{formatNPR(bounds.maxRupees * 100)}</span>
        </p>
      )}
      <Button type="submit" variant="outline" size="lg" className="w-full" disabled={isUnchanged}>
        Apply price
      </Button>
    </form>
  )
}
