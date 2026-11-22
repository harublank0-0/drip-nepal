import { useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { router, usePage } from '@inertiajs/react'
import type { Route } from '@tuyau/core/types'
import type { Data } from '@generated/data'
import { fallbackProblem, type Problem } from '@shared/api/problem'
import { INVALID_CREDENTIALS_DETAIL } from '@shared/constants/auth'
import { ACCOUNT_LIMITS } from '@shared/constants/limits'
import { client, urlFor } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { TextField } from '~/components/forms/text_field'
import { PasswordField } from '~/components/forms/password_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'

/*
 * The sign-in form (`logIn`, docs/06 §13.3; docs/08 §2.3, §3.1 "Sign up,
 * log in"; 02 J-04 step 5). Email and password with their `autocomplete`
 * tokens (`email`, `current-password`; 08 §6.5, SC 1.3.5); paste and
 * password managers work, and the password has a show and hide button (SC
 * 3.3.8). No "remember me" (docs/07 §3.5).
 *
 * `return_to` is read from the page URL and sent unchanged as the body
 * member; on success the page goes only to the `redirect_to` the server
 * returns after checking it (docs/07 TM-14, AC-J00-02), replacing this
 * entry, so Back does not reopen the form. Without a `return_to` that is
 * `/`, the interim home page until M4's (pages/storefront/home.tsx).
 *
 * The form pattern of docs/08 §7.1, and the refusals of 06 §13.3:
 * - 401: one message for a wrong password and an unknown email
 *   (AC-FR-IAM-003-2), told apart by its `detail`; `useApiMutation` hands
 *   it back instead of visiting this page again. Any other 401 is the
 *   account check's (docs/07 §3.3): this browser still held a session that
 *   had gone stale (the password changed elsewhere), which that request
 *   has just ended, with its CSRF secret. The page reloads for a fresh
 *   token and sends the same values once more; if that fails too, the
 *   problem shows with its reference.
 * - 403 `ACCOUNT_SUSPENDED`: the suspension notice with the support
 *   contact (06 §5.2); the same notice shows when the account check sent a
 *   suspended user here (`notice`).
 * - 429: the wait next to the button, which stays disabled until it ends.
 * - 409 `CONFLICT`: already signed in, in another tab: the page reloads,
 *   and the server sends a signed-in visitor away.
 * - 422 on its fields; anything else above the button with its reference.
 * A failed submit keeps both values.
 */
type Body = Route.Body<'logIn'>

type Values = { email: string; password: string }

type Refusal = 'invalid' | 'suspended'

// In the form's order, with each input's id, for the error summary (docs/08 §7.1).
const FIELDS = [
  { name: 'email', id: 'login-email' },
  { name: 'password', id: 'login-password' },
] as const
const KNOWN = new Set<string>(FIELDS.map((field) => field.name))

const EMPTY: Values = { email: '', password: '' }

const RATE_LIMIT_ID = 'login-rate-limit'

// Only what the server would refuse too: an `@` with something on each side, within 254.
function emailError(value: string) {
  const email = value.trim()
  const at = email.lastIndexOf('@')
  const shaped = at > 0 && at < email.length - 1
  return shaped && email.length <= ACCOUNT_LIMITS.email.max ? undefined : t('auth.login.email_rule')
}

// No minimum at sign-in (docs/07 §3.7): any password up to the maximum reaches the server.
function passwordError(value: string) {
  return value.length > 0 && value.length <= ACCOUNT_LIMITS.password.max
    ? undefined
    : t('auth.login.password_rule')
}

export function LogInForm({ notice }: { notice: 'account_suspended' | null }) {
  const mutation = useApiMutation({ signInOnUnauthenticated: false })
  const report = useErrorReport(FIELDS)
  const [refusal, setRefusal] = useState<Refusal | null>(
    notice === 'account_suspended' ? 'suspended' : null
  )
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const returnTo = useReturnTo()
  // Set for the one automatic resend after a stale session was ended.
  const resending = useRef(false)

  function resetMessages() {
    setRefusal(null)
    setProblem(null)
    setOffline(false)
  }

  const form = useForm({
    defaultValues: EMPTY,
    // Submit re-runs every validator on the current values (docs/09 §13.5).
    canSubmitWhenInvalid: true,
    onSubmitInvalid: ({ formApi }) => {
      resetMessages()
      report.failed(formApi)
    },
    onSubmit: async ({ value, formApi }) => {
      const resend = resending.current
      resending.current = false
      resetMessages()
      report.clear()
      const body: Body = {
        email: value.email.trim(),
        password: value.password,
        ...(returnTo === null ? {} : { return_to: returnTo }),
      }
      const outcome = await mutation.run(() => client.request('logIn', { body, timeout: 30_000 }))
      if (!outcome) return
      if (outcome.ok) {
        router.visit(outcome.data.data.redirect_to, { replace: true })
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        return
      }
      const { code } = outcome.problem
      // useApiMutation shows the wait next to the button.
      if (code === 'RATE_LIMITED') return
      if (code === 'UNAUTHENTICATED') {
        if (outcome.problem.detail === INVALID_CREDENTIALS_DETAIL) {
          setRefusal('invalid')
        } else if (resend) {
          setProblem(outcome.problem)
        } else {
          // Reloading keeps the form's state; the page answer brings a new XSRF-TOKEN.
          // If the reload itself fails (offline, a 5xx), say so instead of sitting idle.
          let reloaded = false
          router.reload({
            onSuccess: () => {
              reloaded = true
              resending.current = true
              void formApi.handleSubmit()
            },
            onFinish: () => {
              if (!reloaded) setProblem(fallbackProblem(undefined))
            },
          })
        }
        return
      }
      if (code === 'ACCOUNT_SUSPENDED') {
        setRefusal('suspended')
        return
      }
      if (code === 'CONFLICT') {
        router.reload()
        return
      }
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
      {refusal === 'suspended' && <SuspendedNotice />}
      <form.Field name="email" validators={{ onBlur: ({ value }) => emailError(value) }}>
        {(field) => (
          <TextField
            id="login-email"
            type="email"
            label={t('auth.login.email')}
            autoComplete="email"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={(value) => changeAndRecheck(field, value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <div className="space-y-2">
        <form.Field name="password" validators={{ onBlur: ({ value }) => passwordError(value) }}>
          {(field) => (
            <PasswordField
              id="login-password"
              label={t('auth.login.password')}
              autoComplete="current-password"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <p className="text-sm">
          {/* `/forgot-password` comes with M1 part 4; until then the link opens the 404 page. */}
          <a className="text-link underline underline-offset-4" href="/forgot-password">
            {t('auth.login.forgot')}
          </a>
        </p>
      </div>
      {refusal === 'invalid' && (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{t('auth.login.invalid')}</AlertDescription>
        </Alert>
      )}
      <ProblemAlert problem={problem} offline={offline} />
      <div className="space-y-2">
        {/* aria-disabled, not disabled, while busy: it keeps focus (08 §7.1). */}
        <Button
          type="submit"
          className={`h-11 w-full text-base ${PENDING_BUTTON}`}
          aria-disabled={blocked || undefined}
          aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
        >
          {mutation.pending ? t('auth.login.submitting') : t('auth.login.submit')}
        </Button>
        <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
      </div>
      <p className="text-muted-foreground text-center text-sm">
        {t('auth.login.no_account')}{' '}
        <a className="text-link underline underline-offset-4" href={signUpHref(returnTo)}>
          {t('auth.login.create_account')}
        </a>
      </p>
    </form>
  )
}

/*
 * The suspension notice (docs/06 §5.2 `ACCOUNT_SUSPENDED`: "Show the
 * suspension notice and support contact"), with the support contact the
 * operator configured, as the footer's help link has it; without one, the
 * text alone.
 */
function SuspendedNotice() {
  const { support } = usePage<Data.SharedProps>().props
  const help = support.email ? `mailto:${support.email}` : support.whatsapp
  return (
    <Alert role="alert" variant="destructive">
      <AlertTitle>{t('auth.login.suspended_title')}</AlertTitle>
      <AlertDescription>
        <p>{t('auth.login.suspended_body')}</p>
        {help && (
          <p>
            <a className="underline underline-offset-4" href={help}>
              {t('common.support.contact')}
            </a>
          </p>
        )}
      </AlertDescription>
    </Alert>
  )
}

/*
 * `/login?return_to=…`: the value is read from the page URL, which the
 * server and the browser render alike, and passed on unchanged, to `logIn`
 * and as the `return_to` query of `/signup` (docs/07 TM-14); this page
 * never navigates to it.
 */
function useReturnTo() {
  const { url } = usePage()
  return new URL(url, 'http://localhost').searchParams.get('return_to')
}

const signUpHref = (returnTo: string | null) =>
  returnTo ? `${urlFor('signup')}?return_to=${encodeURIComponent(returnTo)}` : urlFor('signup')
