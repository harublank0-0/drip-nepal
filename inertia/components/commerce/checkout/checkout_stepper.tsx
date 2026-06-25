import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { CheckoutStep } from '~/types/checkout'

const STEPS: { key: CheckoutStep; label: string }[] = [
  { key: 'address', label: 'Address' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'payment', label: 'Payment' },
  { key: 'review', label: 'Review' },
]

const STEP_ORDER: CheckoutStep[] = ['address', 'delivery', 'payment', 'review']

type CheckoutStepperProps = {
  currentStep: CheckoutStep
}

export function CheckoutStepper({ currentStep }: CheckoutStepperProps) {
  const currentIndex = STEP_ORDER.indexOf(currentStep)

  return (
    <nav aria-label="Checkout progress" className="mb-8">
      <ol className="flex items-center gap-0">
        {STEPS.map((step, index) => {
          const isCompleted = index < currentIndex
          const isCurrent = index === currentIndex

          return (
            <li key={step.key} className="flex items-center flex-1">
              <div className="flex items-center gap-2">
                <div
                  className={`relative flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isCurrent
                        ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                        : 'bg-muted text-muted-foreground'
                  }`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? <Check className="size-3.5" /> : <span>{index + 1}</span>}
                </div>
                <span
                  className={`hidden text-xs font-medium sm:inline ${
                    isCurrent
                      ? 'text-foreground'
                      : isCompleted
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground/50'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {index < STEPS.length - 1 && (
                <div className="mx-2 flex-1">
                  <div className="h-px w-full bg-border/50">
                    <motion.div
                      initial={{ width: '0%' }}
                      animate={{
                        width: isCompleted ? '100%' : '0%',
                      }}
                      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                      className="h-full bg-primary"
                    />
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
