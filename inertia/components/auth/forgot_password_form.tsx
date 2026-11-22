import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { ACCOUNT_LIMITS } from '@shared/constants/limits'
import { maskEmail } from '@shared/format/email'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { TextField } from '~/components/forms/text_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'

/*
 * The reset request form (`requestPasswordReset`, docs/06 §13.3; docs/08
 * §2.3, §3.1 "Verify email, forgot and reset password"; 02 J-18 step 1),
 * on `/forgot-password` and in the expired-link state of `/reset-password`
 * (02 J-18 "Recovery": "a new request form"). One email field with the
 * `email` token (08 §6.5, SC 1.3.5).
 *
 * `requestPasswordReset` answers the same 202 for every address
 * (AC-FR-IAM-004-1), so on success the form hands the address the user
 * typed, masked in the browser, to `onSent`, and the page shows the one
 * confirmation; nothing is looked up. The form pattern of docs/08 §7.1:
 * the client rule mirrors the server's and runs on blur and submit; a 422
 * lands on the field; `RATE_LIMITED` (the fourth request for one address in
 * an hour, AC-J18-01) shows its wait next to the button, which stays
 * disabled until it ends (08 §8.3); any other problem shows above the
 * button with its reference. A failed submit keeps the value.
 */
type Body = Route.Body<'requestPasswordReset'>

type Values = { email: string }

const EMPTY: Values = { email: '' }
const KNOWN = new Set<string>(['email'])

// Only what the server would refuse too: an `@` with something on each side, within 254.
function emailError(value: string) {
  const email = value.trim()
  const at = email.lastIndexOf('@')
  const shaped = at > 0 && at < email.length - 1
  return shaped && email.length <= ACCOUNT_LIMITS.email.max
    ? undefined
    : t('auth.forgot.email_rule')
}

export function ForgotPasswordForm({
  idPrefix,
  onSent,
}: {
  // Keeps the ids unique when the form sits inside another page's state.
  idPrefix: string
  onSent: (maskedEmail: string) => void
}) {
  const emailId = `${idPrefix}-email`
  const rateLimitId = `${idPrefix}-rate-limit`
  const fields = [{ name: 'email', id: emailId }] as const
  const mutation = useApiMutation()
  const report = useErrorReport(fields)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)

  const form = useForm({
    defaultValues: EMPTY,
    // Submit re-runs every validator on the current values (docs/09 §13.5).
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
      const body: Body = { email: value.email.trim() }
      const outcome = await mutation.run(() =>
        client.request('requestPasswordReset', { body, timeout: 30_000 })
      )
      if (!outcome) return
      if (outcome.ok) {
        onSent(maskEmail(body.email.toLowerCase()))
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
      <form.Field name="email" validators={{ onBlur: ({ value }) => emailError(value) }}>
        {(field) => (
          <TextField
            id={emailId}
            type="email"
            label={t('auth.forgot.email')}
            autoComplete="email"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={(value) => changeAndRecheck(field, value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <ProblemAlert problem={problem} offline={offline} />
      <div className="space-y-2">
        {/* aria-disabled, not disabled, while busy: it keeps focus (08 §7.1). */}
        <Button
          type="submit"
          className={`h-11 w-full text-base ${PENDING_BUTTON}`}
          aria-disabled={blocked || undefined}
          aria-describedby={mutation.retryIn > 0 ? rateLimitId : undefined}
        >
          {mutation.pending ? t('auth.forgot.submitting') : t('auth.forgot.submit')}
        </Button>
        <RateLimitNotice id={rateLimitId} seconds={mutation.retryIn} />
      </div>
    </form>
  )
}

/*
 * The one confirmation after a request (AC-FR-IAM-004-1, 02 J-18 step 1):
 * the typed address, masked, and the same words whether or not it has an
 * account; the delay note covers an email outage, when the job retries (02
 * J-18 "External-provider failure"). "Use another email" brings the form
 * back for a mistyped address.
 */
export function ResetLinkSent({ sentTo, onAgain }: { sentTo: string; onAgain: () => void }) {
  return (
    <div className="space-y-4">
      <p>{t('auth.forgot.sent.body', { email: sentTo })}</p>
      <p className="text-muted-foreground text-sm">{t('auth.forgot.sent.delay')}</p>
      <Button type="button" variant="outline" className="h-11 w-full text-base" onClick={onAgain}>
        {t('auth.forgot.sent.again')}
      </Button>
    </div>
  )
}
