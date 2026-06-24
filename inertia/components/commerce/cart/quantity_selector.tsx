import { motion } from 'framer-motion'
import { Minus, Plus } from 'lucide-react'
import { Button } from '~/components/ui/button'

type QuantitySelectorProps = {
  quantity: number
  onIncrease: () => void
  onDecrease: () => void
  isLoading?: boolean
  min?: number
  max?: number
}

export function QuantitySelector({
  quantity,
  onIncrease,
  onDecrease,
  isLoading = false,
  min = 1,
  max = 99,
}: QuantitySelectorProps) {
  const isAtMin = quantity <= min
  const isAtMax = quantity >= max

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={isAtMin || isLoading}
        onClick={onDecrease}
        aria-label="Decrease quantity"
        className="size-6 rounded-md"
      >
        <Minus className="size-3" />
      </Button>
      <div className="flex items-center justify-center w-8 h-6">
        <motion.span
          key={quantity}
          initial={{ opacity: 0, y: -6, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
          className="text-xs font-medium tabular-nums"
        >
          {quantity}
        </motion.span>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={isAtMax || isLoading}
        onClick={onIncrease}
        aria-label="Increase quantity"
        className="size-6 rounded-md"
      >
        <Plus className="size-3" />
      </Button>
    </div>
  )
}
