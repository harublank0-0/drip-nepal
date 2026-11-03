import { MinusIcon, PlusIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'

type QuantitySelectorProps = {
  quantity: number
  min?: number
  max: number
  disabled?: boolean
  /* What is being counted, for screen readers. */
  label: string
  onChange: (quantity: number) => void
}

export function QuantitySelector({
  quantity,
  min = 1,
  max,
  disabled = false,
  label,
  onChange,
}: QuantitySelectorProps) {
  return (
    <div
      role="group"
      aria-label={`Quantity of ${label}`}
      className="inline-flex items-center rounded-lg border border-border bg-background"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 rounded-r-none sm:size-8"
        disabled={disabled || quantity <= min}
        onClick={() => onChange(quantity - 1)}
        aria-label="Decrease quantity"
      >
        <MinusIcon className="size-3.5" />
      </Button>
      <output aria-live="polite" className="w-9 text-center text-sm font-medium tabular-nums">
        {quantity}
      </output>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 rounded-l-none sm:size-8"
        disabled={disabled || quantity >= max}
        onClick={() => onChange(quantity + 1)}
        aria-label="Increase quantity"
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </div>
  )
}
