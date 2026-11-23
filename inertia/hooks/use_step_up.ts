import { useRef, useState } from 'react'
import type { Problem } from '@shared/api/problem'
import { TOTP_CODE_PATTERN, totpInput } from '@shared/constants/auth'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { t } from '~/lib/i18n'

/*
 * Step-up inside a dialog (docs/08 §7.3 rule 5; docs/07 §3.10; docs/06
 * §4.3). When an action answers 401 `MFA_REQUIRED` with
 * `mfa: "verification_required"`, the same dialog keeps its values and
 * swaps in a TOTP field (`StepUpField`); dialogs are never stacked. The
 * next submit first sends the code to `verifyMfaChallenge` and, once it
 * passes, sends the action again with the same body, so a ⚷ action's
 * `useIntentKey` gives the same `Idempotency-Key` (06 §7.4: a 401 stored
 * nothing, so the retry runs it).
 *
 * In a dialog's submit handler:
 *   if (!(await stepUp.ready())) return       // verifies the typed code when needed
 *   const outcome = await mutation.run(send)
 *   if (!outcome.ok && 'problem' in outcome && stepUp.refused(outcome.problem)) return
 *
 * `verifyMfaChallenge` answers: a wrong or replayed code is the field's
 * error, and the field takes focus again; `RATE_LIMITED` (after 5 wrong
 * codes in 5 minutes the next attempt is refused unchecked, right or wrong,
 * and the account's codes are blocked for 15 minutes, OD-50) is this hook's
 * `retryIn`, which the dialog shows next to its confirm button; anything
 * else is `problem`, shown with its reference. `UNAUTHENTICATED` visits the
 * sign-in page, as every action's does (`useApiMutation`). The challenge
 * gives the session a new ID; the cookie follows, and Shield's secret moves
 * with the session, so the retry passes the CSRF check.
 *
 * `needed` and `code` are mirrored in refs, so `ready()` reads what the
 * user typed whichever render's handler calls it.
 */
export const isStepUpRefusal = (problem: Problem) =>
  problem.code === 'MFA_REQUIRED' && problem.mfa === 'verification_required'

export type StepUp = ReturnType<typeof useStepUp>

export function useStepUp() {
  const verify = useApiMutation()
  const [needed, setNeededState] = useState(false)
  const [code, setCodeState] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const neededRef = useRef(false)
  const codeRef = useRef('')
  const fieldRef = useRef<HTMLInputElement>(null)

  function setNeeded(value: boolean) {
    neededRef.current = value
    setNeededState(value)
  }

  function setCode(value: string) {
    codeRef.current = value
    setCodeState(value)
    setError(null)
  }

  function clearMessages() {
    setError(null)
    setProblem(null)
    setOffline(false)
  }

  // A failed action's problem: true when it asked for step-up, and the field is now shown.
  function refused(failed: Problem) {
    if (!isStepUpRefusal(failed)) return false
    clearMessages()
    setCode('')
    setNeeded(true)
    return true
  }

  // Before (re)sending the action. True when no code is needed, or the typed one passed.
  async function ready(): Promise<boolean> {
    if (!neededRef.current) return true
    clearMessages()
    const value = totpInput(codeRef.current)
    if (!TOTP_CODE_PATTERN.test(value)) {
      setError(t('common.step_up.code_rule'))
      fieldRef.current?.focus()
      return false
    }
    const outcome = await verify.run(() =>
      client.request('verifyMfaChallenge', { body: { code: value }, timeout: 30_000 })
    )
    if (!outcome) return false
    if (outcome.ok) {
      setCode('')
      setNeeded(false)
      return true
    }
    if ('offline' in outcome) {
      setOffline(true)
      return false
    }
    // useApiMutation shows the wait through `retryIn`.
    if (outcome.problem.code === 'RATE_LIMITED') return false
    if (outcome.problem.errors?.some((item) => item.field === 'code')) {
      setCodeState('')
      codeRef.current = ''
      setError(t('common.step_up.code_incorrect'))
      fieldRef.current?.focus()
      return false
    }
    setProblem(outcome.problem)
    return false
  }

  // When the dialog closes.
  function reset() {
    clearMessages()
    setCode('')
    setNeeded(false)
  }

  return {
    needed,
    code,
    setCode,
    error,
    problem,
    offline,
    // Plain values for StepUpField, which takes the ref apart (React Compiler refs rule).
    view: { needed, code, setCode, error, problem, offline },
    fieldRef,
    refused,
    ready,
    reset,
    pending: verify.pending,
    retryIn: verify.retryIn,
  }
}
