import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { useForm } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { ACCOUNT_LIMITS } from '@shared/constants/limits'
import { client, urlFor } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { PasswordField } from '~/components/forms/password_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'
import { ForgotPasswordForm, ResetLinkSent } from '~/components/auth/forgot_password_form'

/*
 * What `/reset-password` shows (docs/08 §2.3, §3.1 "Verify email, forgot
 * and reset password"; 02 J-18 steps 3–4 and its "Recovery" and
 * "Concurrency" rows; 01 AC-FR-IAM-004-4).
 *
 * The emailed link opens it as `/reset-password?token=…`. On its first
 * render in the browser the page drops the token from the address bar
 * with a replace visit (`history.replaceState`), as `/verify-email` does,
 * and keeps it in memory for the form; a reload after that finds no token
 * and offers a new link. The page never shows the token or any account
 * detail.
 *
 * - The form: one new password with the `new-password` token, a show and
 *   hide button and the 10–128 rule as help (docs/07 §3.7, SC 3.3.8); paste
 *   and password managers work. No second "confirm" field: the show button
 *   lets the user check it (SC 3.3.7).
 * - 200: nobody is signed in (AC-FR-IAM-004-4), so the page moves to
 *   `/login` in the browser with a success notice, replacing this entry so
 *   Back does not reopen a spent link (02 J-18 step 4). A session of the
 *   same account in this browser is now stale; the sign-in form handles it.
 * - 422 on `token` (unknown, used in another tab, replaced by a newer link
 *   or expired): "This link has expired" with the request form in place
 *   (02 J-18 "Recovery"); 422 on `password` lands on the field.
 * - anything else: the problem with its reference above the button; a
 *   `RATE_LIMITED` wait (no limiter covers `resetPassword` today) shows
 *   next to it.
 */
type Body = Route.Body<'resetPassword'>

type Phase = 'form' | 'invalid' | 'missing'

const FIELDS = [{ name: 'password', id: 'reset-password' }] as const
const KNOWN = new Set<string>(['password'])
const RATE_LIMIT_ID = 'reset-rate-limit'

const { min, max } = ACCOUNT_LIMITS.password

function passwordError(value: string) {
  return value.length >= min && value.length <= max
    ? undefined
    : t('auth.reset.password_rule', { min, max })
}

export function ResetPasswordPanel({ token }: { token: string | null }) {
  const kept = useRef(token)
  const started = useRef(false)
  const [phase, setPhase] = useState<Phase>(token ? 'form' : 'missing')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const mutation = useApiMutation()
  const report = useErrorReport(FIELDS)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)

  // Once per page load, in the browser only (docs/09 §13.8 rule 1): the token leaves the URL.
  const onFirstRender = useEffectEvent(() => {
    if (!kept.current || started.current) return
    started.current = true
    router.replace({ url: urlFor('reset_password'), preserveState: true, preserveScroll: true })
  })
  useEffect(() => {
    onFirstRender()
  }, [])

  const form = useForm({
    defaultValues: { password: '' },
    canSubmitWhenInvalid: true,
    onSubmitInvalid: ({ formApi }) => {
      setProblem(null)
      setOffline(false)
      report.failed(formApi)
    },
    onSubmit: async ({ value, formApi }) => {
      const tokenValue = kept.current
      if (!tokenValue) return
      setProblem(null)
      setOffline(false)
      report.clear()
      const body: Body = { token: tokenValue, password: value.password }
      const outcome = await mutation.run(() =>
        client.request('resetPassword', { body, timeout: 30_000 })
      )
      if (!outcome) return
      if (outcome.ok) {
        router.replace({
          url: urlFor('login'),
          component: 'auth/login',
          // The shared props, signed out, with the notice; this page has no props of its own.
          props: (current) => ({ ...current, user: null, notice: null, password_changed: true }),
        })
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        return
      }
      const { code, errors } = outcome.problem
      if (code === 'RATE_LIMITED') return
      if (code === 'VALIDATION_FAILED' && errors?.some((item) => item.field === 'token')) {
        kept.current = null
        setPhase('invalid')
        return
      }
      if (errors?.length) {
        report.failed(formApi, applyServerErrors(formApi, outcome.problem, KNOWN))
      } else {
        setProblem(outcome.problem)
      }
    },
  })

  if (phase !== 'form') {
    const expired = phase === 'invalid'
    return (
      <Panel
        phase={phase}
        heading={t(expired ? 'auth.reset.invalid.heading' : 'auth.reset.missing.heading')}
      >
        {sentTo ? (
          <ResetLinkSent sentTo={sentTo} onAgain={() => setSentTo(null)} />
        ) : (
          <>
            <p className="text-muted-foreground">
              {t(expired ? 'auth.reset.invalid.body' : 'auth.reset.missing.body')}
            </p>
            <ForgotPasswordForm idPrefix="reset-request" onSent={setSentTo} />
          </>
        )}
        <BackToSignIn />
      </Panel>
    )
  }

  const blocked = mutation.pending || mutation.retryIn > 0
  return (
    <Panel phase={phase} heading={t('auth.reset.heading')}>
      <p className="text-muted-foreground">{t('auth.reset.intro')}</p>
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <ErrorSummary form={form} summary={report.summary} summaryRef={report.summaryRef} />
        <form.Field name="password" validators={{ onBlur: ({ value }) => passwordError(value) }}>
          {(field) => (
            <PasswordField
              id="reset-password"
              label={t('auth.reset.password')}
              description={t('auth.reset.password_help', { min, max })}
              autoComplete="new-password"
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
            aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
          >
            {mutation.pending ? t('auth.reset.submitting') : t('auth.reset.submit')}
          </Button>
          <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
        </div>
      </form>
      <BackToSignIn />
    </Panel>
  )
}

function BackToSignIn() {
  return (
    <p className="text-center text-sm">
      <a className="text-link underline underline-offset-4" href={urlFor('login')}>
        {t('auth.forgot.back')}
      </a>
    </p>
  )
}

/*
 * The heading and the body of one state. When the state changes (the link
 * turns out expired), focus moves to the new heading, so a screen reader
 * reads it (docs/08 §9.1); the first render leaves focus alone.
 */
function Panel({
  phase,
  heading,
  children,
}: {
  phase: Phase
  heading: string
  children: ReactNode
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previous = useRef<Phase | undefined>(undefined)
  useEffect(() => {
    if (previous.current !== undefined && previous.current !== phase) headingRef.current?.focus()
    previous.current = phase
  }, [phase])
  return (
    <div className="space-y-5">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
      >
        {heading}
      </h1>
      {children}
    </div>
  )
}
