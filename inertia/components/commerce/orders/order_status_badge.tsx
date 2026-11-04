import { cn } from '~/lib/utils'

type Style = { label: string; className: string }

const ORDER_STATUS: Record<string, Style> = {
  pending: { label: 'Pending', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  confirmed: { label: 'Confirmed', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  shipped: { label: 'Shipped', className: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  delivered: {
    label: 'Delivered',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
}

const PAYMENT_STATUS: Record<string, Style> = {
  pending: {
    label: 'Payment pending',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  },
  paid: { label: 'Paid', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  voided: { label: 'Voided', className: 'bg-muted text-muted-foreground' },
  failed: { label: 'Payment failed', className: 'bg-destructive/15 text-destructive' },
  refunded: { label: 'Refunded', className: 'bg-muted text-muted-foreground' },
}

function StatusPill({ style, className }: { style: Style; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        style.className,
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {style.label}
    </span>
  )
}

function fallback(status: string): Style {
  return { label: status, className: 'bg-muted text-muted-foreground capitalize' }
}

/*
 * An order's status as the customer sees it.
 */
export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  return <StatusPill style={ORDER_STATUS[status] ?? fallback(status)} className={className} />
}

export function PaymentStatusBadge({ status, className }: { status: string; className?: string }) {
  return <StatusPill style={PAYMENT_STATUS[status] ?? fallback(status)} className={className} />
}
