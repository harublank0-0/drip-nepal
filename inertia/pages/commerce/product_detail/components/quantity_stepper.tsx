import { Minus, Plus } from 'lucide-react'

type QuantityStepperProps = {
  value: number
  max: number
  disabled?: boolean
  onChange: (value: number) => void
}

export function QuantityStepper({ value, max, disabled = false, onChange }: QuantityStepperProps) {
  const canDecrease = !disabled && value > 1
  const canIncrease = !disabled && value < max

  return (
    <div
      className="inline-flex h-11 items-center rounded-lg border border-border"
      role="group"
      aria-label="Quantity"
    >
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={!canDecrease}
        className="flex size-11 items-center justify-center rounded-l-lg transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        aria-label="Decrease quantity"
      >
        <Minus className="size-4" />
      </button>
      <span
        className="flex h-full w-10 items-center justify-center border-x border-border text-sm font-medium tabular-nums"
        aria-live="polite"
        aria-atomic="true"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={!canIncrease}
        className="flex size-11 items-center justify-center rounded-r-lg transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        aria-label="Increase quantity"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}
