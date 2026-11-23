import { useState } from 'react'
import type { Problem } from '@shared/api/problem'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { ConfirmDialog } from '~/components/common/confirm_dialog'
import { ProblemAlert } from '~/components/forms/problem_alert'

/*
 * "Sign out of all other devices" on `/account/security`
 * (`revokeAllSessions`, docs/06 §13.3; 01 AC-FR-IAM-005-3; 02 J-18 step 5).
 * It signs out every device but this one, so it asks first in a tier-1
 * `ConfirmDialog` that says so (docs/08 §7.3); the confirm button names the
 * action. On success the dialog closes, a status line says the other
 * devices are signed out, and the "sessions revoked" email goes out. The
 * 6th call in an hour is refused (`revoke_all`): the wait shows next to
 * the confirm button, which stays disabled until it ends (08 §8.3). A
 * session that went stale meanwhile gets 401, and `useApiMutation` sends
 * the user to sign in; another problem, or being offline, shows in the
 * dialog with its reference.
 */
export function SignOutEverywhere() {
  const mutation = useApiMutation()
  const [open, setOpen] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [done, setDone] = useState(false)

  async function confirm() {
    setProblem(null)
    setOffline(false)
    const outcome = await mutation.run(() =>
      client.request('revokeAllSessions', { timeout: 30_000 })
    )
    if (!outcome) return
    if (outcome.ok) {
      setOpen(false)
      setDone(true)
      return
    }
    if ('offline' in outcome) {
      setOffline(true)
      return
    }
    // useApiMutation shows the wait next to the confirm button.
    if (outcome.problem.code === 'RATE_LIMITED') return
    setProblem(outcome.problem)
  }

  return (
    <div className="space-y-4">
      {done && (
        <Alert role="status">
          <AlertTitle>{t('account.sessions.done_title')}</AlertTitle>
          <AlertDescription>{t('account.sessions.done_body')}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full text-base sm:w-auto"
        onClick={() => {
          setProblem(null)
          setOffline(false)
          setDone(false)
          setOpen(true)
        }}
      >
        {t('account.sessions.action')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('account.sessions.confirm_title')}
        consequence={t('account.sessions.consequence')}
        confirmLabel={t('account.sessions.confirm')}
        pendingLabel={t('account.sessions.pending')}
        destructive={false}
        pending={mutation.pending}
        retryIn={mutation.retryIn}
        onConfirm={() => void confirm()}
      >
        <ProblemAlert problem={problem} offline={offline} />
      </ConfirmDialog>
    </div>
  )
}
