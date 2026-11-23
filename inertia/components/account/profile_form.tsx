import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { ACCOUNT_LIMITS } from '@shared/constants/limits'
import { toNepalMobileE164 } from '@shared/format/phone'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { FieldDescription, FieldLegend, FieldSet } from '~/components/ui/field'
import { TextField } from '~/components/forms/text_field'
import { NepalPhoneInput } from '~/components/forms/nepal_phone_input'
import { CheckboxField } from '~/components/forms/checkbox_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'

/*
 * The profile form of `/account` (`updateMe`, docs/06 §13.3; docs/08 §2.4,
 * §3.1; 01 FR-IAM-013, AC-FR-IAM-013-1): the name, the mobile number and
 * the two marketing consents, each with its `autocomplete` token (08 §6.5,
 * SC 1.3.5). The email is shown, not editable: no operation changes the
 * login email in R1.
 *
 * The page never holds the phone itself, only its last four digits
 * (docs/07 §5.5), so the phone field starts empty: a number typed there
 * replaces the saved one, and an empty field keeps it. "Remove my number"
 * sends `phone: null` on its own. The consent boxes start as saved; an
 * unticked box withdraws that consent at once (07 §5.3).
 *
 * The form pattern of docs/08 §7.1: client rules mirror the server's
 * (shared/constants/limits.ts, shared/format/phone.ts) and run on blur and
 * submit; a 422 lands on its fields; any other problem shows above the
 * button with its reference; a failed submit keeps every value. After a
 * save the page reloads its props (docs/09 §13.3 rule 3) and a status line
 * says it is saved.
 */
type Body = Route.Body<'updateMe'>

type Account = {
  email: string
  full_name: string | null
  phone_last4: string | null
  marketing_email_consent: boolean
  marketing_sms_consent: boolean
}

type Values = {
  full_name: string
  phone: string
  marketing_email_consent: boolean
  marketing_sms_consent: boolean
}

// In the form's order, with each input's id, for the error summary (docs/08 §7.1).
const FIELDS = [
  { name: 'full_name', id: 'profile-full-name' },
  { name: 'phone', id: 'profile-phone' },
  { name: 'marketing_email_consent', id: 'profile-marketing-email' },
  { name: 'marketing_sms_consent', id: 'profile-marketing-sms' },
] as const
const KNOWN = new Set<string>(FIELDS.map((field) => field.name))

const { fullName, phoneInput } = ACCOUNT_LIMITS
const RATE_LIMIT_ID = 'profile-rate-limit'
const REMOVE_RATE_LIMIT_ID = 'profile-remove-rate-limit'

// Code points after NFC, as `users_full_name_check` counts them (docs/04 §2.8).
const nameLength = (value: string) => [...value.trim().normalize('NFC')].length

function phoneError(value: string) {
  if (value.trim() === '') return undefined
  return value.length <= phoneInput.max && toNepalMobileE164(value) !== null
    ? undefined
    : t('account.profile.phone_rule')
}

export function ProfileForm({ account }: { account: Account }) {
  const mutation = useApiMutation()
  const removal = useApiMutation()
  const report = useErrorReport(FIELDS)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [done, setDone] = useState<'saved' | 'phone_removed' | null>(null)

  function resetMessages() {
    setProblem(null)
    setOffline(false)
    setDone(null)
  }

  const form = useForm({
    defaultValues: {
      full_name: account.full_name ?? '',
      phone: '',
      marketing_email_consent: account.marketing_email_consent,
      marketing_sms_consent: account.marketing_sms_consent,
    } satisfies Values,
    // Submit re-runs every validator on the current values (docs/09 §13.5).
    canSubmitWhenInvalid: true,
    onSubmitInvalid: ({ formApi }) => {
      resetMessages()
      report.failed(formApi)
    },
    onSubmit: async ({ value, formApi }) => {
      resetMessages()
      report.clear()
      const phone = value.phone.trim()
      const body: Body = {
        full_name: value.full_name.trim(),
        marketing_email_consent: value.marketing_email_consent,
        marketing_sms_consent: value.marketing_sms_consent,
        // E.164 when the shared rule reads it; anything else goes as typed, for the server to refuse.
        ...(phone === '' ? {} : { phone: toNepalMobileE164(phone) ?? phone }),
      }
      const outcome = await mutation.run(() =>
        client.request('updateMe', { body, timeout: 30_000 })
      )
      if (!outcome) return
      if (outcome.ok) {
        formApi.setFieldValue('phone', '')
        setDone('saved')
        router.reload()
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

  async function removePhone() {
    resetMessages()
    report.clear()
    const outcome = await removal.run(() =>
      client.request('updateMe', { body: { phone: null }, timeout: 30_000 })
    )
    if (!outcome) return
    if (outcome.ok) {
      setDone('phone_removed')
      router.reload()
      return
    }
    if ('offline' in outcome) {
      setOffline(true)
      return
    }
    if (outcome.problem.code === 'RATE_LIMITED') return
    setProblem(outcome.problem)
  }

  const blocked = mutation.pending || mutation.retryIn > 0
  const removeBlocked = removal.pending || removal.retryIn > 0

  return (
    <section aria-labelledby="profile-heading" className="space-y-4">
      <h2 id="profile-heading" className="font-heading text-xl font-semibold tracking-tight">
        {t('account.profile.heading')}
      </h2>
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <ErrorSummary form={form} summary={report.summary} summaryRef={report.summaryRef} />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('account.profile.email')}</p>
          <p className="break-all">{account.email}</p>
          <p className="text-muted-foreground text-sm">{t('account.profile.email_help')}</p>
        </div>
        <form.Field
          name="full_name"
          validators={{
            onBlur: ({ value }) => {
              const length = nameLength(value)
              return length < fullName.min || length > fullName.max
                ? t('account.profile.full_name_rule', { max: fullName.max })
                : undefined
            },
          }}
        >
          {(field) => (
            <TextField
              id="profile-full-name"
              label={t('account.profile.full_name')}
              autoComplete="name"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="phone" validators={{ onBlur: ({ value }) => phoneError(value) }}>
          {(field) => (
            <NepalPhoneInput
              id="profile-phone"
              label={t('account.profile.phone')}
              description={
                account.phone_last4
                  ? t('account.profile.phone_help_saved', { last4: account.phone_last4 })
                  : t('account.profile.phone_help_none')
              }
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <FieldSet className="gap-3">
          <FieldLegend variant="label">{t('account.profile.marketing_legend')}</FieldLegend>
          <FieldDescription>{t('account.profile.marketing_help')}</FieldDescription>
          <form.Field name="marketing_email_consent">
            {(field) => (
              <CheckboxField
                id="profile-marketing-email"
                label={t('account.profile.marketing_email')}
                checked={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => field.handleChange(value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field name="marketing_sms_consent">
            {(field) => (
              <CheckboxField
                id="profile-marketing-sms"
                label={t('account.profile.marketing_sms')}
                checked={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => field.handleChange(value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </FieldSet>
        {done && (
          <Alert role="status">
            <AlertDescription>
              {done === 'saved' ? t('account.profile.saved') : t('account.profile.phone_removed')}
            </AlertDescription>
          </Alert>
        )}
        <ProblemAlert problem={problem} offline={offline} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="space-y-2">
            {/* aria-disabled, not disabled, while busy: it keeps focus (08 §7.1). */}
            <Button
              type="submit"
              className={`h-11 w-full text-base sm:w-auto ${PENDING_BUTTON}`}
              aria-disabled={blocked || undefined}
              aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
            >
              {mutation.pending ? t('account.profile.submitting') : t('account.profile.submit')}
            </Button>
            <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
          </div>
          {account.phone_last4 && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className={`h-11 w-full text-base sm:w-auto ${PENDING_BUTTON}`}
                aria-disabled={removeBlocked || undefined}
                aria-describedby={removal.retryIn > 0 ? REMOVE_RATE_LIMIT_ID : undefined}
                onClick={() => {
                  if (!removeBlocked) void removePhone()
                }}
              >
                {removal.pending
                  ? t('account.profile.removing_phone')
                  : t('account.profile.remove_phone')}
              </Button>
              <RateLimitNotice id={REMOVE_RATE_LIMIT_ID} seconds={removal.retryIn} />
            </div>
          )}
        </div>
      </form>
    </section>
  )
}
