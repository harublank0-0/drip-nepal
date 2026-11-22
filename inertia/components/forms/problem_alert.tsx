import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { StatusBadge } from '~/components/common/status_badge'
import type { Problem } from '@shared/api/problem'
import type { StatusEntity } from '@shared/ui/status_tones'
import { t } from '~/lib/i18n'

/*
 * A form-level failure with no field errors (docs/08 §7.1, §8.3, AC-J00-01),
 * with the reference support asks for:
 * - a step-up refusal (401 `MFA_REQUIRED`, `verification_required`) says what
 *   to do (08 §7.3 rule 5; the TOTP field arrives with M1's `verifyMfaChallenge`);
 * - `NOT_FOUND` says the item no longer exists, and `INVALID_STATE_TRANSITION`
 *   shows `current_status` through `StatusBadge`; the caller reloads its list;
 * - a 5xx, a client-bug code or a body that was not problem+json gets the
 *   generic message; any other code shows the server's detail.
 * Offline keeps the form and says so (§8.4; `OfflineBanner` comes later).
 */
const CLIENT_BUG_CODES = new Set([
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'PRECONDITION_REQUIRED',
  'MALFORMED_REQUEST',
])

function isGeneric(problem: Problem) {
  return (
    problem.status >= 500 ||
    CLIENT_BUG_CODES.has(problem.code) ||
    problem.request_id === 'unavailable'
  )
}

export function ProblemAlert({
  problem,
  offline,
  entity,
}: {
  problem?: Problem | null
  offline?: boolean
  // The entity whose `current_status` an INVALID_STATE_TRANSITION shows.
  entity?: StatusEntity
}) {
  if (offline) {
    return (
      <Alert role="alert">
        <AlertDescription>{t('common.form.offline')}</AlertDescription>
      </Alert>
    )
  }
  if (!problem) return null
  if (problem.code === 'MFA_REQUIRED' && problem.mfa === 'verification_required') {
    return (
      <Alert role="alert">
        <AlertTitle>{t('common.form.step_up_title')}</AlertTitle>
        <AlertDescription>{t('common.form.step_up_body')}</AlertDescription>
      </Alert>
    )
  }
  const current =
    problem.code === 'INVALID_STATE_TRANSITION' && typeof problem.current_status === 'string'
      ? problem.current_status
      : null
  // The server's default detail is its title with a full stop (app/exceptions/to_problem.ts);
  // anything else is a reason worth showing, such as a parcel still on its way.
  const reason = problem.detail && problem.detail !== `${problem.title}.` ? problem.detail : null
  let message: string
  if (isGeneric(problem)) message = t('common.form.failed')
  else if (problem.code === 'NOT_FOUND') message = t('common.form.gone')
  else if (problem.code === 'INVALID_STATE_TRANSITION') message = reason ?? t('common.form.changed')
  else message = problem.detail ?? problem.title
  return (
    <Alert role="alert" variant="destructive">
      <AlertDescription>
        <p>{message}</p>
        {current && entity && (
          <p className="flex flex-wrap items-center gap-2">
            {t('common.form.now_status')} <StatusBadge entity={entity} state={current} />
          </p>
        )}
        <p className="text-muted-foreground">
          {t('common.form.reference', { id: problem.request_id })}
        </p>
      </AlertDescription>
    </Alert>
  )
}
