import { useState } from 'react'
import { router } from '@inertiajs/react'
import type { Problem } from '@shared/api/problem'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { announce } from '~/lib/announce'
import { PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'

/*
 * "Send a new link" for a signed-in `pending_verification` user
 * (`resendEmailVerification`, docs/06 §13.3; docs/08 §2.3; 02 J-04 step 3):
 * the earlier links stop working. At most 3 an hour (`verify_resend`,
 * docs/06 §9.1): the 4th shows its wait next to the button, which stays
 * disabled until it ends (08 §8.3). A user verified meanwhile, in another
 * tab or on another device, gets 403, and the page reloads its status to
 * say so. A session that ended is sent to sign in (useApiMutation).
 */
const RATE_LIMIT_ID = 'resend-rate-limit'

export function ResendVerification({ email }: { email: string }) {
  const mutation = useApiMutation()
  const [sent, setSent] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const blocked = mutation.pending || mutation.retryIn > 0

  async function resend() {
    if (blocked) return
    setSent(false)
    setProblem(null)
    setOffline(false)
    const outcome = await mutation.run(() =>
      client.request('resendEmailVerification', { timeout: 30_000 })
    )
    if (!outcome) return
    if (outcome.ok) {
      setSent(true)
      announce(t('auth.verify.resent', { email }))
      return
    }
    if ('offline' in outcome) {
      setOffline(true)
      return
    }
    const { code } = outcome.problem
    // useApiMutation shows the wait, or sends an ended session to sign in.
    if (code === 'RATE_LIMITED' || code === 'UNAUTHENTICATED') return
    if (code === 'FORBIDDEN') {
      router.reload({ only: ['account_status'] })
      return
    }
    setProblem(outcome.problem)
  }

  return (
    <div className="space-y-3">
      {/* Announced once by `announce`; shown here so it stays readable. */}
      {sent && (
        <p className="bg-muted rounded-md px-3 py-2 text-sm">
          {t('auth.verify.resent', { email })}
        </p>
      )}
      <ProblemAlert problem={problem} offline={offline} />
      {/* Not disabled while pending or rate limited, so it keeps focus; presses are ignored (08 §7.1). */}
      <Button
        type="button"
        variant="outline"
        className={`h-11 w-full text-base ${PENDING_BUTTON}`}
        aria-disabled={blocked || undefined}
        aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
        onClick={() => void resend()}
      >
        {mutation.pending ? t('auth.verify.resending') : t('auth.verify.resend')}
      </Button>
      <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
    </div>
  )
}
