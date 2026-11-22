import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { router, usePage } from '@inertiajs/react'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { ACCOUNT_LIMITS } from '@shared/constants/limits'
import { maskEmail } from '@shared/format/email'
import { toNepalMobileE164 } from '@shared/format/phone'
import { client, urlFor } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { FieldDescription, FieldLegend, FieldSet } from '~/components/ui/field'
import { TextField } from '~/components/forms/text_field'
import { PasswordField } from '~/components/forms/password_field'
import { NepalPhoneInput } from '~/components/forms/nepal_phone_input'
import { CheckboxField } from '~/components/forms/checkbox_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'
import { LegalDocumentLinks, type LegalDocumentLink } from '~/components/auth/legal_document_links'

/*
 * The sign-up form (`signUp`, docs/06 §13.3; docs/08 §3.1 "Sign up, log
 * in"; 02 J-04 steps 1–3). Full name, email, password and an optional
 * Nepali mobile number, each with its `autocomplete` token (08 §6.5, SC
 * 1.3.5); the 18+ box (OD-24, decided for the build) and the two marketing
 * boxes start unticked (FR-IAM-013); the terms of use and the privacy
 * notice are linked in the versions `signUp` records (AC-FR-IAM-001-6).
 * Paste and password managers work (SC 3.3.8).
 *
 * The form pattern of docs/08 §7.1: client rules mirror the server's
 * limits (shared/constants/limits.ts, shared/format/phone.ts) and run on
 * blur and submit; a field that shows an error is checked again as the
 * user types; a failed submit focuses the only invalid field or the error
 * summary; a 422 lands on its fields; any other problem shows above the
 * submit button with its reference, and `RATE_LIMITED` shows its wait next
 * to the button, which stays disabled until it ends (08 §8.3).
 *
 * `signUp` answers the same 202 whether or not the address had an account
 * (AC-FR-IAM-001-2), and creates no session, so on success the page moves
 * to `/verify-email` in the browser, with the address the user typed,
 * masked, and nothing looked up (02 J-04 step 3): a client-side visit
 * (`router.push`) that keeps the shared props and asks the server nothing.
 */
type Body = Route.Body<'signUp'>

type Values = {
  full_name: string
  email: string
  password: string
  phone: string
  age_confirmed: boolean
  marketing_email_consent: boolean
  marketing_sms_consent: boolean
}

const EMPTY: Values = {
  full_name: '',
  email: '',
  password: '',
  phone: '',
  age_confirmed: false,
  marketing_email_consent: false,
  marketing_sms_consent: false,
}

// In the form's order, with each input's id, for the error summary (docs/08 §7.1).
const FIELDS = [
  { name: 'full_name', id: 'signup-full-name' },
  { name: 'email', id: 'signup-email' },
  { name: 'password', id: 'signup-password' },
  { name: 'phone', id: 'signup-phone' },
  { name: 'age_confirmed', id: 'signup-age' },
  { name: 'marketing_email_consent', id: 'signup-marketing-email' },
  { name: 'marketing_sms_consent', id: 'signup-marketing-sms' },
] as const
const KNOWN = new Set<string>(FIELDS.map((field) => field.name))

const { email: emailLimit, fullName, password, phoneInput } = ACCOUNT_LIMITS
const RATE_LIMIT_ID = 'signup-rate-limit'

// Code points after NFC, as `users_full_name_check` counts them (docs/04 §2.8).
const nameLength = (value: string) => [...value.trim().normalize('NFC')].length

// Only what the server would refuse too: an `@` with something on each side, within 254.
function emailError(value: string) {
  const email = value.trim()
  const at = email.lastIndexOf('@')
  const shaped = at > 0 && at < email.length - 1
  return shaped && email.length <= emailLimit.max ? undefined : t('auth.signup.email_rule')
}

function phoneError(value: string) {
  if (value.trim() === '') return undefined
  return value.length <= phoneInput.max && toNepalMobileE164(value) !== null
    ? undefined
    : t('auth.signup.phone_rule')
}

// The page's own props, which a client-side visit to another page leaves behind.
const OWN_PROPS = new Set(['legal_documents'])

export function SignUpForm({ legalDocuments }: { legalDocuments: LegalDocumentLink[] }) {
  const mutation = useApiMutation()
  const report = useErrorReport(FIELDS)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)

  const form = useForm({
    defaultValues: EMPTY,
    // Submit re-runs every validator on the current values, so an error the user has just
    // fixed never blocks the submit (docs/09 §13.5).
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
      const phone = value.phone.trim()
      const body: Body = {
        email: value.email.trim(),
        password: value.password,
        full_name: value.full_name.trim(),
        // E.164 when the shared rule reads it; anything else goes as typed, for the server to refuse.
        phone: phone === '' ? null : (toNepalMobileE164(phone) ?? phone),
        age_confirmed: value.age_confirmed,
        marketing_email_consent: value.marketing_email_consent,
        marketing_sms_consent: value.marketing_sms_consent,
      }
      const outcome = await mutation.run(() => client.request('signUp', { body, timeout: 30_000 }))
      if (!outcome) return
      if (outcome.ok) {
        const sentTo = maskEmail(body.email.toLowerCase())
        router.push({
          url: urlFor('verify_email'),
          component: 'auth/verify_email',
          props: (current) => ({
            ...Object.fromEntries(Object.entries(current).filter(([key]) => !OWN_PROPS.has(key))),
            account_status: null,
            sent_to: sentTo,
          }),
        })
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
  const returnTo = useReturnTo()

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
        name="full_name"
        validators={{
          onBlur: ({ value }) => {
            const length = nameLength(value)
            return length < fullName.min || length > fullName.max
              ? t('auth.signup.full_name_rule', { max: fullName.max })
              : undefined
          },
        }}
      >
        {(field) => (
          <TextField
            id="signup-full-name"
            label={t('auth.signup.full_name')}
            autoComplete="name"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={(value) => changeAndRecheck(field, value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field name="email" validators={{ onBlur: ({ value }) => emailError(value) }}>
        {(field) => (
          <TextField
            id="signup-email"
            type="email"
            label={t('auth.signup.email')}
            autoComplete="email"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={(value) => changeAndRecheck(field, value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field
        name="password"
        validators={{
          onBlur: ({ value }) =>
            value.length < password.min || value.length > password.max
              ? t('auth.signup.password_rule', password)
              : undefined,
        }}
      >
        {(field) => (
          <PasswordField
            id="signup-password"
            label={t('auth.signup.password')}
            description={t('auth.signup.password_help', password)}
            autoComplete="new-password"
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
            id="signup-phone"
            label={t('auth.signup.phone')}
            description={t('auth.signup.phone_help')}
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={(value) => changeAndRecheck(field, value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field
        name="age_confirmed"
        validators={{
          onBlur: ({ value }) => (value ? undefined : t('auth.signup.age_rule')),
        }}
      >
        {(field) => (
          <CheckboxField
            id="signup-age"
            label={t('auth.signup.age')}
            checked={field.state.value}
            errors={field.state.meta.errors}
            onChange={(value) => changeAndRecheck(field, value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <FieldSet className="gap-3">
        <FieldLegend variant="label">{t('auth.signup.marketing_legend')}</FieldLegend>
        <FieldDescription>{t('auth.signup.marketing_help')}</FieldDescription>
        <form.Field name="marketing_email_consent">
          {(field) => (
            <CheckboxField
              id="signup-marketing-email"
              label={t('auth.signup.marketing_email')}
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
              id="signup-marketing-sms"
              label={t('auth.signup.marketing_sms')}
              checked={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => field.handleChange(value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
      </FieldSet>
      <LegalDocumentLinks documents={legalDocuments} />
      <ProblemAlert problem={problem} offline={offline} />
      <div className="space-y-2">
        {/* Not disabled while pending or rate limited, so it keeps focus; presses are ignored (08 §7.1). */}
        <Button
          type="submit"
          className={`h-11 w-full text-base ${PENDING_BUTTON}`}
          aria-disabled={blocked || undefined}
          aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
        >
          {mutation.pending ? t('auth.signup.submitting') : t('auth.signup.submit')}
        </Button>
        <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
      </div>
      <p className="text-muted-foreground text-center text-sm">
        {t('auth.signup.have_account')}{' '}
        <a className="text-link underline underline-offset-4" href={signInHref(returnTo)}>
          {t('auth.signup.sign_in')}
        </a>
      </p>
    </form>
  )
}

/*
 * `/signup?return_to=…` passes `return_to` on unchanged, only as the
 * `return_to` query of `/login`, which validates it (docs/07 TM-14,
 * docs/08 §2.3); this page never navigates to it. Read from the page URL,
 * which the server and the browser render alike.
 */
function useReturnTo() {
  const { url } = usePage()
  return new URL(url, 'http://localhost').searchParams.get('return_to')
}

// `/login` is a route of M1 part 3; until then the link opens the 404 page.
const signInHref = (returnTo: string | null) =>
  returnTo ? `/login?return_to=${encodeURIComponent(returnTo)}` : '/login'
