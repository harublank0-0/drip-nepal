import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import type { Problem } from '@shared/api/problem'
import { t } from '~/lib/i18n'

/*
 * A form-level failure with no field errors (docs/08 §7.1, AC-J00-01): the
 * server's detail and the reference support asks for. A step-up refusal
 * (401 `MFA_REQUIRED`, `verification_required`) says what to do instead
 * (08 §7.3 rule 5; the TOTP field arrives with M1's `verifyMfaChallenge`).
 * Offline keeps the form and says so (§8.4).
 */
export function ProblemAlert({
  problem,
  offline,
}: {
  problem?: Problem | null
  offline?: boolean
}) {
  if (offline) {
    return (
      <Alert role="alert">
        <AlertDescription>{t('common.form.offline')}</AlertDescription>
      </Alert>
    )
  }
  if (!problem) return null
  const stepUp = problem.code === 'MFA_REQUIRED' && problem.mfa === 'verification_required'
  return (
    <Alert role="alert" variant={stepUp ? 'default' : 'destructive'}>
      <AlertTitle>{stepUp ? t('common.form.step_up_title') : problem.title}</AlertTitle>
      <AlertDescription>
        <p>{stepUp ? t('common.form.step_up_body') : (problem.detail ?? problem.title)}</p>
        {!stepUp && (
          <p className="text-muted-foreground">
            {t('common.form.reference', { id: problem.request_id })}
          </p>
        )}
      </AlertDescription>
    </Alert>
  )
}
