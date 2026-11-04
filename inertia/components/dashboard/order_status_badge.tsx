import { cn } from '~/lib/utils'

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: 'To confirm', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  confirmed: { label: 'To ship', className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  shipped: { label: 'Shipped', className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  delivered: {
    label: 'Delivered',
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
}

/*
 * An order status as a shop sees it: "pending" reads "To confirm".
 */
export function OrderStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, className: 'bg-muted' }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        style.className
      )}
    >
      {style.label}
    </span>
  )
}
