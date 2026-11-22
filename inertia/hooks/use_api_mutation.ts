import { useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import { apiCall, type ApiOutcome } from '~/lib/api'

/*
 * `run(send)` wraps `apiCall` with a pending flag and one request in flight
 * (docs/09 §13.4), and applies the page-level codes of docs/08 §8.3:
 * `UNAUTHENTICATED` visits the sign-in page and `MFA_REQUIRED` for enrolment
 * visits `/mfa`. A step-up refusal (`MFA_REQUIRED` with
 * `mfa: "verification_required"`) and every other problem go back to the
 * caller, whose dialog keeps its values and says what to do (08 §7.3 rule 5).
 */
export function useApiMutation() {
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)

  async function run<T>(send: () => Promise<T>): Promise<ApiOutcome<T> | null> {
    if (inFlight.current) return null
    inFlight.current = true
    setPending(true)
    try {
      const outcome = await apiCall(send)
      if (!outcome.ok && 'problem' in outcome) {
        const { problem } = outcome
        // Back to this page afterwards, query included, as the server's page redirects do.
        const here = encodeURIComponent(`${window.location.pathname}${window.location.search}`)
        if (problem.code === 'UNAUTHENTICATED') {
          router.visit(`/login?return_to=${here}`)
        } else if (problem.code === 'MFA_REQUIRED' && problem.mfa === 'enrollment_required') {
          router.visit(`/mfa?return_to=${here}`)
        }
      }
      return outcome
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return { run, pending }
}
