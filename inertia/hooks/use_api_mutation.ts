import { useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import { retryWaitSeconds, secondsUntil, waitText } from '@shared/ui/retry_wait'
import { apiCall, type ApiOutcome } from '~/lib/api'
import { announce } from '~/lib/announce'
import { t } from '~/lib/i18n'

/*
 * `run(send)` wraps `apiCall` with a pending flag and one request in flight
 * (docs/09 §13.4), and applies the page-level codes of docs/08 §8.3:
 * `UNAUTHENTICATED` visits the sign-in page and `MFA_REQUIRED` for enrolment
 * visits `/mfa`. A step-up refusal (`MFA_REQUIRED` with
 * `mfa: "verification_required"`) and every other problem go back to the
 * caller, whose dialog keeps its values and says what to do (08 §7.3 rule 5).
 *
 * `RATE_LIMITED` (08 §8.3, AC-J00-04): the action is disabled until
 * `Retry-After` has passed. `run` refuses to send meanwhile (it returns
 * null, as for a second press), `retryIn` counts the seconds left for the
 * caller's `RateLimitNotice` next to the action, and the wait is announced
 * once, assertively, and its end once, politely: never the countdown itself
 * (08 §7.4, §11.7 rule 2). Every caller renders `RateLimitNotice` with
 * `retryIn` next to its action and keeps the action `aria-disabled` while
 * `retryIn > 0` (ConfirmDialog takes `retryIn` for its callers); otherwise a
 * press after the 429 would do nothing with no visible reason. The caller
 * still receives the outcome and shows no other message for it.
 *
 * `signInOnUnauthenticated: false` hands `UNAUTHENTICATED` back to the
 * caller instead of visiting the sign-in page, for the two operations
 * whose 401 means something else: `logIn` (a wrong email or password) and
 * `logOut` (the session is already gone, which is the outcome asked for).
 */
export function useApiMutation({ signInOnUnauthenticated = true } = {}) {
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  // Epoch milliseconds until which RATE_LIMITED blocks the action; 0 when it does not.
  const blockedUntil = useRef(0)
  const [blockedTill, setBlockedTill] = useState(0)
  const [retryIn, setRetryIn] = useState(0)

  // One tick a second while blocked; the timer stops when the wait ends or the form unmounts.
  useEffect(() => {
    if (blockedTill === 0) return
    const timer = window.setInterval(() => {
      const left = secondsUntil(blockedTill, Date.now())
      setRetryIn(left)
      if (left > 0) return
      blockedUntil.current = 0
      setBlockedTill(0)
      announce(t('common.rate_limited.ready'))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [blockedTill])

  function block(retryAfter: unknown) {
    const seconds = retryWaitSeconds(retryAfter)
    const until = Date.now() + seconds * 1000
    blockedUntil.current = until
    setBlockedTill(until)
    setRetryIn(seconds)
    announce(t('common.rate_limited.wait', waitText(seconds)), 'assertive')
  }

  async function run<T>(send: () => Promise<T>): Promise<ApiOutcome<T> | null> {
    if (inFlight.current || blockedUntil.current > Date.now()) return null
    inFlight.current = true
    setPending(true)
    try {
      const outcome = await apiCall(send)
      if (!outcome.ok && 'problem' in outcome) {
        const { problem } = outcome
        // Back to this page afterwards, query included, as the server's page redirects do.
        const here = encodeURIComponent(`${window.location.pathname}${window.location.search}`)
        if (problem.code === 'UNAUTHENTICATED') {
          if (signInOnUnauthenticated) router.visit(`/login?return_to=${here}`)
        } else if (problem.code === 'MFA_REQUIRED' && problem.mfa === 'enrollment_required') {
          router.visit(`/mfa?return_to=${here}`)
        } else if (problem.code === 'RATE_LIMITED') {
          block(problem.retry_after_seconds)
        }
      }
      return outcome
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  // `retryIn` is 0 unless RATE_LIMITED blocks the action.
  return { run, pending, retryIn }
}
