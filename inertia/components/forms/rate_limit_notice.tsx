import { ClockIcon } from 'lucide-react'
import { waitText } from '@shared/ui/retry_wait'
import { t } from '~/lib/i18n'

/*
 * The `RATE_LIMITED` wait, inline next to the action it blocks (docs/08
 * §8.3, AC-J00-04): "Too many attempts. Try again in 40 seconds.", counting
 * down while `useApiMutation` keeps the action disabled. It is not a live
 * region: `useApiMutation` announces the wait once and its end once
 * (08 §11.7 rule 2), so the countdown is never read out every second. A
 * screen reader that reads the line finds the time left. Renders nothing
 * once the wait is over.
 */
export function RateLimitNotice({ seconds, id }: { seconds: number; id?: string }) {
  if (seconds <= 0) return null
  return (
    <p id={id} className="text-destructive flex items-start gap-2 text-sm">
      <ClockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{t('common.rate_limited.wait', waitText(seconds))}</span>
    </p>
  )
}
