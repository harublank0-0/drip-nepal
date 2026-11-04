import { usePage } from '@inertiajs/react'
import { MailIcon, MessageCircleIcon, PhoneIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import { cn } from '~/lib/utils'

export function useSupport() {
  return usePage<Data.SharedProps>().props.support
}

export function hasContact(support: Data.SharedProps['support']) {
  return Boolean(support.phone || support.email)
}

/*
 * Ways to reach the store, from SUPPORT_PHONE and SUPPORT_EMAIL. Renders
 * nothing when neither is set.
 */
export function ContactOptions({
  className,
  message,
}: {
  className?: string
  /* Pre-filled WhatsApp text, e.g. the order number. */
  message?: string
}) {
  const support = useSupport()
  if (!hasContact(support)) return null

  const whatsapp =
    support.whatsapp && message
      ? `${support.whatsapp}?text=${encodeURIComponent(message)}`
      : support.whatsapp

  const item =
    'flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-card px-4 text-sm font-medium transition-colors hover:bg-muted'

  return (
    <ul className={cn('grid gap-2 sm:grid-cols-2', className)}>
      {whatsapp && (
        <li>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={item}>
            <MessageCircleIcon className="size-4 text-emerald-500" aria-hidden="true" />
            WhatsApp us
          </a>
        </li>
      )}
      {support.phone && (
        <li>
          <a href={`tel:${support.phone.replace(/\s/g, '')}`} className={item}>
            <PhoneIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            Call {support.phone}
          </a>
        </li>
      )}
      {support.email && (
        <li className={cn(!support.phone && 'sm:col-span-2')}>
          <a href={`mailto:${support.email}`} className={item}>
            <MailIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{support.email}</span>
          </a>
        </li>
      )}
    </ul>
  )
}
