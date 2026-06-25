import { motion } from 'framer-motion'
import { CheckIcon } from 'lucide-react'
import { cn } from '~/lib/utils'

type Step = {
  number: number
  label: string
}

type ProgressStepperProps = {
  steps: Step[]
  currentStep: number
}

export function ProgressStepper({ steps, currentStep }: ProgressStepperProps) {
  return (
    <nav aria-label="Onboarding progress" className="flex items-center justify-center gap-0">
      {steps.map((step, index) => {
        const isCompleted = currentStep > step.number
        const isActive = currentStep === step.number
        const isLast = index === steps.length - 1

        return (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                className={cn(
                  'flex size-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isActive && 'bg-primary text-primary-foreground ring-2 ring-primary/30',
                  !isCompleted &&
                    !isActive &&
                    'border-2 border-muted-foreground/30 text-muted-foreground'
                )}
                layout
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                {isCompleted ? (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  >
                    <CheckIcon className="size-4" />
                  </motion.span>
                ) : (
                  step.number
                )}
              </motion.div>
              <span
                className={cn(
                  'text-xs font-medium',
                  isActive && 'text-foreground',
                  isCompleted && 'text-muted-foreground',
                  !isActive && !isCompleted && 'text-muted-foreground/60'
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div className="mx-3 mb-5 flex items-center">
                <motion.div
                  className={cn('h-px w-12', isCompleted ? 'bg-primary' : 'bg-muted-foreground/20')}
                  layout
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
