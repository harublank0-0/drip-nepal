import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { ACCOUNT_LIMITS } from '@shared/constants/limits'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { PasswordField } from '~/components/forms/password_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'

/*
 * Change password on `/account/security` (`changePassword`, docs/06 §13.3;
 * 01 FR-IAM-005; 02 J-18 step 5; docs/08 §2.4). The current password
 * (`current-password`, no minimum, docs/07 §3.7) and one new password
 * (`new-password`, 10–128, no second field, as on `/reset-password`), each
 * with a show and hide button; paste and password managers work (SC 3.3.8).
 *
 * On success this device stays signed in under a new session ID, the other
 * devices are signed out when the job runs, and the "password changed"
 * email goes out (AC-FR-IAM-005-2, -4); the form empties and a status line
 * says so. A wrong current password is 422 on its field and counts toward
 * the `reauth` limiter: after 5 in 15 minutes the wait shows next to the
 * button, which stays disabled until it ends (08 §8.3); the 6th successful
 * change in an hour is refused the same way (`password_change`). A session
 * that went stale meanwhile gets 401, and `useApiMutation` sends the user
 * to sign in. A failed submit keeps both values.
 */
type Body = Route.Body<'changePassword'>

type Values = { current_password: string; new_password: string }

const EMPTY: Values = { current_password: '', new_password: '' }

// In the form's order, with each input's id, for the error summary (docs/08 §7.1).
const FIELDS = [
  { name: 'current_password', id: 'password-current' },
  { name: 'new_password', id: 'password-new' },
] as const
const KNOWN = new Set<string>(FIELDS.map((field) => field.name))

const { password } = ACCOUNT_LIMITS
const RATE_LIMIT_ID = 'password-rate-limit'

export function ChangePasswordForm() {
  const mutation = useApiMutation()
  const report = useErrorReport(FIELDS)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [changed, setChanged] = useState(false)

  const form = useForm({
    defaultValues: EMPTY,
    // Submit re-runs every validator on the current values (docs/09 §13.5).
    canSubmitWhenInvalid: true,
    onSubmitInvalid: ({ formApi }) => {
      setProblem(null)
      setOffline(false)
      setChanged(false)
      report.failed(formApi)
    },
    onSubmit: async ({ value, formApi }) => {
      setProblem(null)
      setOffline(false)
      setChanged(false)
      report.clear()
      const body: Body = {
        current_password: value.current_password,
        new_password: value.new_password,
      }
      const outcome = await mutation.run(() =>
        client.request('changePassword', { body, timeout: 30_000 })
      )
      if (!outcome) return
      if (outcome.ok) {
        formApi.reset()
        setChanged(true)
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        return
      }
      // useApiMutation shows the wait next to the button.
      if (outcome.problem.code === 'RATE_LIMITED') return
      if (outcome.problem.errors?.length) {
        report.failed(formApi, applyServerErrors(formApi, outcome.problem, KNOWN))
      } else {
        setProblem(outcome.problem)
      }
    },
  })

  const blocked = mutation.pending || mutation.retryIn > 0

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <ErrorSummary form={form} summary={report.summary} summaryRef={report.summaryRef} />
      <form.Field
        name="current_password"
        validators={{
          onBlur: ({ value }) =>
            value.length > 0 && value.length <= password.max
              ? undefined
              : t('account.password.current_rule'),
        }}
      >
        {(field) => (
          <PasswordField
            id="password-current"
            label={t('account.password.current')}
            autoComplete="current-password"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={(value) => changeAndRecheck(field, value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field
        name="new_password"
        validators={{
          onBlur: ({ value }) =>
            value.length < password.min || value.length > password.max
              ? t('account.password.new_rule', password)
              : undefined,
        }}
      >
        {(field) => (
          <PasswordField
            id="password-new"
            label={t('account.password.new')}
            description={t('account.password.new_help', password)}
            autoComplete="new-password"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={(value) => changeAndRecheck(field, value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      {changed && (
        <Alert role="status">
          <AlertTitle>{t('account.password.done_title')}</AlertTitle>
          <AlertDescription>{t('account.password.done_body')}</AlertDescription>
        </Alert>
      )}
      <ProblemAlert problem={problem} offline={offline} />
      <div className="space-y-2">
        {/* aria-disabled, not disabled, while busy: it keeps focus (08 §7.1). */}
        <Button
          type="submit"
          className={`h-11 w-full text-base sm:w-auto ${PENDING_BUTTON}`}
          aria-disabled={blocked || undefined}
          aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
        >
          {mutation.pending ? t('account.password.submitting') : t('account.password.submit')}
        </Button>
        <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
      </div>
    </form>
  )
}
