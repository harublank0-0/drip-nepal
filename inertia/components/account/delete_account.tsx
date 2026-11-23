import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { ACCOUNT_LIMITS } from '@shared/constants/limits'
import { client, urlFor } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { ConfirmDialog } from '~/components/common/confirm_dialog'
import { ErrorSummary } from '~/components/forms/error_summary'
import { PasswordField } from '~/components/forms/password_field'
import { ProblemAlert } from '~/components/forms/problem_alert'

/*
 * The deletion request on `/account/security` (`requestAccountDeletion`,
 * docs/06 §13.3; 01 FR-IAM-009, AC-FR-IAM-009-1; docs/08 §2.4, §7.3). A
 * destructive tier-1 `ConfirmDialog` states the consequence; the password
 * the server requires is the one field inside it (08 §7.3 rule 3), so the
 * password re-entry is the friction that type-to-confirm gives elsewhere.
 * It asks for no reason: the request's only record is an insert-only audit
 * row that outlives anonymisation, so it keeps no free text (docs/04
 * §19.2).
 *
 * On the 202 the account is closed and the server has ended this session
 * too: the client clears Inertia's history, as a sign-out does (docs/07
 * §3.11), and visits `/login`, replacing this entry, where the notice the
 * server flashed says the account is closed. A wrong password is 422 on
 * its field and counts toward the `reauth` limiter (the wait shows next to
 * the confirm button); the last active platform admin gets 409, shown with
 * its reason; a refusal keeps the dialog open with what was typed.
 */
type Body = Route.Body<'requestAccountDeletion'>

const FIELDS = [{ name: 'password', id: 'delete-password' }] as const
const KNOWN = new Set<string>(FIELDS.map((field) => field.name))

const { password } = ACCOUNT_LIMITS

export function DeleteAccount() {
  const mutation = useApiMutation()
  const report = useErrorReport(FIELDS)
  const [open, setOpen] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)

  const form = useForm({
    defaultValues: { password: '' },
    canSubmitWhenInvalid: true,
    onSubmitInvalid: ({ formApi }) => {
      setProblem(null)
      setOffline(false)
      report.failed(formApi)
    },
    onSubmit: async ({ value, formApi }) => {
      setProblem(null)
      setOffline(false)
      report.clear()
      const body: Body = { password: value.password }
      const outcome = await mutation.run(() =>
        client.request('requestAccountDeletion', { body, timeout: 30_000 })
      )
      if (!outcome) return
      if (outcome.ok) {
        router.clearHistory()
        router.visit(urlFor('login'), { replace: true })
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        return
      }
      if (outcome.problem.errors?.length) {
        report.failed(formApi, applyServerErrors(formApi, outcome.problem, KNOWN))
        return
      }
      // useApiMutation shows the wait next to the confirm button.
      if (outcome.problem.code === 'RATE_LIMITED') return
      setProblem(outcome.problem)
    },
  })

  function close() {
    form.reset()
    report.clear()
    setProblem(null)
    setOffline(false)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        className="h-11 w-full text-base sm:w-auto"
        onClick={() => setOpen(true)}
      >
        {t('account.delete.action')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={t('account.delete.confirm_title')}
        consequence={t('account.delete.consequence')}
        confirmLabel={t('account.delete.confirm')}
        pendingLabel={t('account.delete.pending')}
        pending={mutation.pending}
        retryIn={mutation.retryIn}
        onConfirm={() => void form.handleSubmit()}
      >
        <ErrorSummary form={form} summary={report.summary} summaryRef={report.summaryRef} />
        <form.Field
          name="password"
          validators={{
            onBlur: ({ value }) =>
              value.length > 0 && value.length <= password.max
                ? undefined
                : t('account.delete.password_rule'),
          }}
        >
          {(field) => (
            <PasswordField
              id="delete-password"
              label={t('account.delete.password')}
              autoComplete="current-password"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <ProblemAlert problem={problem} offline={offline} />
      </ConfirmDialog>
    </>
  )
}
