import { motion } from 'framer-motion'
import { Shield } from 'lucide-react'
import { PaymentMethodCard } from './payment_method_card'
import type { PaymentMethod } from '~/types/checkout'

type PaymentStepProps = {
  methods: PaymentMethod[]
  selectedMethodId: string | null
  onSelect: (id: string) => void
  isLoading: boolean
}

export function PaymentStep({ methods, selectedMethodId, onSelect, isLoading }: PaymentStepProps) {
  if (isLoading) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
    >
      <div className="mb-6">
        <h2 className="text-lg font-semibold font-heading">Payment</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your preferred payment method.
        </p>
      </div>

      <div className="space-y-2" role="radiogroup" aria-label="Payment methods">
        {methods
          .filter((m) => m.enabled)
          .map((method) => (
            <PaymentMethodCard
              key={method.id}
              method={method}
              selected={selectedMethodId === method.id}
              onSelect={() => onSelect(method.id)}
            />
          ))}
      </div>

      {methods.filter((m) => !m.enabled).length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            More payment options coming soon
          </h3>
          <div className="space-y-2 opacity-60">
            {methods
              .filter((m) => !m.enabled)
              .map((method) => (
                <PaymentMethodCard
                  key={method.id}
                  method={method}
                  selected={false}
                  onSelect={() => {}}
                />
              ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
        <Shield className="size-4 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          Your payment information is secure. We use encryption to protect your data.
        </p>
      </div>
    </motion.div>
  )
}
