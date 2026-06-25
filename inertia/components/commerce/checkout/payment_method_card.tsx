import { motion } from 'framer-motion'
import { Banknote, Landmark, Wallet, CreditCard, Ban } from 'lucide-react'
import { cn } from '~/lib/utils'
import type { PaymentMethod } from '~/types/checkout'

const PAYMENT_ICONS: Record<string, React.ElementType> = {
  'cod': Banknote,
  'bank-transfer': Landmark,
  'esewa': Wallet,
  'khalti': Wallet,
  'ime-pay': Wallet,
  'stripe': CreditCard,
}

type PaymentMethodCardProps = {
  method: PaymentMethod
  selected: boolean
  onSelect: () => void
}

export function PaymentMethodCard({ method, selected, onSelect }: PaymentMethodCardProps) {
  const Icon = PAYMENT_ICONS[method.id] || Ban

  return (
    <button
      type="button"
      onClick={method.enabled ? onSelect : undefined}
      disabled={!method.enabled}
      className={cn(
        'relative flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all',
        method.enabled
          ? selected
            ? 'border-primary bg-primary/5 shadow-xs cursor-pointer'
            : 'border-border/50 bg-card hover:border-border hover:bg-muted/50 cursor-pointer'
          : 'border-border/30 bg-muted/30 cursor-not-allowed opacity-60'
      )}
      aria-checked={method.enabled && selected}
      role="radio"
      aria-disabled={!method.enabled}
    >
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors',
          selected
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-border/50 bg-muted text-muted-foreground'
        )}
      >
        <Icon className="size-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{method.name}</span>
          {!method.enabled && (
            <span className="rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Coming Soon
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{method.description}</p>
      </div>

      <div
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
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
    </button>
  )
}
