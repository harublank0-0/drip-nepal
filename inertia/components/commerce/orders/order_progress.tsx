import { CheckIcon } from 'lucide-react'
import { cn } from '~/lib/utils'

const STEPS = [
  { status: 'pending', label: 'Placed' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'delivered', label: 'Delivered' },
]

/*
 * Where an order is on its way to the customer. Not meant for cancelled
 * orders: those never reach the later steps.
 */
export function OrderProgress({ status }: { status: string }) {
  const current = STEPS.findIndex((step) => step.status === status)

  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Order progress">
      {STEPS.map((step, index) => {
        const reached = index <= current
        return (
          <li
            key={step.status}
            className="flex min-w-0 flex-col gap-2"
            aria-current={index === current ? 'step' : undefined}
          >
            <span
              className={cn('h-1.5 rounded-full', reached ? 'bg-primary' : 'bg-muted')}
              aria-hidden="true"
            />
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                reached ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {reached && <CheckIcon className="size-3 shrink-0" aria-hidden="true" />}
              <span className="truncate">{step.label}</span>
              <span className="sr-only">{reached ? ' (done)' : ' (not yet)'}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
