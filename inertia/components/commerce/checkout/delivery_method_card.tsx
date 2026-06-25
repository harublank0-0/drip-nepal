import { motion } from 'framer-motion'
import { Package, Zap } from 'lucide-react'
import { cn } from '~/lib/utils'
import type { DeliveryMethod } from '~/types/checkout'

type DeliveryMethodCardProps = {
  method: DeliveryMethod
  selected: boolean
  onSelect: () => void
}

export function DeliveryMethodCard({ method, selected, onSelect }: DeliveryMethodCardProps) {
  const formatPrice = (value: number) => `Rs. ${value.toLocaleString('ne-NP')}`

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all',
        selected
          ? 'border-primary bg-primary/5 shadow-xs'
          : 'border-border/50 bg-card hover:border-border hover:bg-muted/50'
      )}
      aria-checked={selected}
      role="radio"
    >
      <div
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected ? 'border-primary bg-primary' : 'border-input bg-transparent'
        )}
      >
        {selected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
            className="size-1.5 rounded-full bg-primary-foreground"
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {method.name.toLowerCase().includes('express') ? (
            <Zap className="size-3.5 text-amber-500 shrink-0" />
          ) : (
            <Package className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-medium">{method.name}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{method.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Estimated Delivery:{' '}
          <span className="text-foreground font-medium">{method.estimatedDate}</span>
        </p>
      </div>

      <div className="text-sm font-semibold tabular-nums shrink-0">
        {method.price === 0 ? (
          <span className="text-green-600 dark:text-green-400">Free</span>
        ) : (
          formatPrice(method.price)
        )}
      </div>
    </button>
  )
}
