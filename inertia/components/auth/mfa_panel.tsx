import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { useForm } from '@tanstack/react-form'
import { router, usePage } from '@inertiajs/react'
import type { Data } from '@generated/data'
import type { Problem } from '@shared/api/problem'
import { TOTP_CODE_PATTERN, totpInput } from '@shared/constants/auth'
import { ACCOUNT_LIMITS } from '@shared/constants/limits'
import { client, urlFor } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { ErrorSummary } from '~/components/forms/error_summary'
import { PasswordField } from '~/components/forms/password_field'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'
import { TotpField } from '~/components/forms/totp_field'
import { SignOutButton } from '~/components/common/sign_out_button'
import { LogInForm } from '~/components/auth/log_in_form'

/*
 * What `/mfa` shows (docs/08 §2.3, §3.1 "MFA"; docs/07 §3.9; 01
 * AC-FR-IAM-007-1 to -4; M1 part 5), by the server's `mfa_state`:
 *
 * - `sign_in`: no session. The sign-in form, without the sign-up link;
 *   after it succeeds the page reloads its props in place instead of
 *   following `redirect_to`, so the enrolment token stays in memory.
 * - `not_staff`: signed in with an account that is not active staff; it
 *   says so and offers sign-out, after which the page reloads in place and
 *   shows the sign-in form, the enrolment token still in memory.
 * - `enrol`: staff without TOTP. With the emailed token: the current
 *   password (`startTotpEnrollment`), then the setup key and an
 *   `otpauth://` link that opens the authenticator app on a phone, then the
 *   code (`confirmTotpEnrollment`). No QR code yet: it needs a library not
 *   yet approved (docs/09 §10.1; docs/08 note 82). Without a token, or once
 *   the link turns out expired or used, it says to open the email or ask
 *   for a new link.
 * - `challenge`: staff with TOTP. One code field (`verifyMfaChallenge`);
 *   on success the page visits the `redirect_to` the server returns after
 *   checking `return_to` (07 TM-14), replacing this entry. Right after
 *   enrolment a notice asks for the next code, because the one that turned
 *   TOTP on cannot be used again (AC-FR-IAM-007-3).
 *
 * The emailed link opens the page as `/mfa?token=…`. On its first render in
 * the browser the page drops the token from the address bar with a replace
 * visit and keeps it in memory, as `/reset-password` does; `return_to`
 * stays. The token never reaches a `return_to` or another page (07 §3.8).
 *
 * Every code field is one input with `autocomplete="one-time-code"` that
 * accepts paste (SC 3.3.8). `RATE_LIMITED` shows the wait next to the
 * button, which stays disabled until it ends: on the password, the `reauth`
 * limiter or the `totp_start` limit on repeated starts; on codes, after 5
 * wrong codes in 5 minutes the next attempt is refused unchecked, right or
 * wrong, and the account's codes are blocked for 15 minutes (OD-50). A 401, 403 or 409 means the session or the
 * account changed (signed out elsewhere, not staff, already enrolled), so
 * the page reloads its props and shows the state that fits.
 */
export type MfaState = 'sign_in' | 'not_staff' | 'enrol' | 'challenge'

const reloadState = () => router.reload()

const { max: PASSWORD_MAX } = ACCOUNT_LIMITS.password

function codeError(value: string) {
  return TOTP_CODE_PATTERN.test(totpInput(value)) ? undefined : t('auth.mfa.code_rule')
}

// The codes after which the page shows the state the server now gives.
const STATE_CHANGED = new Set(['UNAUTHENTICATED', 'FORBIDDEN', 'CONFLICT'])

export function MfaPanel({
  state,
  token,
  returnTo,
}: {
  state: MfaState
  token: string | null
  returnTo: string | null
}) {
  // The enrolment token, in memory only, for the whole visit (reloads keep the state).
  const [enrolmentToken, setEnrolmentToken] = useState(token)
  const [linkInvalid, setLinkInvalid] = useState(false)
  const [justEnrolled, setJustEnrolled] = useState(false)
  const started = useRef(false)

  // Once per page load, in the browser only (docs/09 §13.8 rule 1): the token leaves the URL.
  const onFirstRender = useEffectEvent(() => {
    if (!token || started.current) return
    started.current = true
    const url = returnTo
      ? `${urlFor('mfa')}?return_to=${encodeURIComponent(returnTo)}`
      : urlFor('mfa')
    router.replace({ url, preserveState: true, preserveScroll: true })
  })
  useEffect(() => {
    onFirstRender()
  }, [])

  if (state === 'sign_in') {
    return (
      <Panel state={state} heading={t('auth.mfa.sign_in.heading')}>
        <p className="text-muted-foreground">{t('auth.mfa.sign_in.intro')}</p>
        <LogInForm notice={null} signUpLink={false} onSignedIn={reloadState} />
      </Panel>
    )
  }

  if (state === 'not_staff') return <NotStaff />

  if (state === 'enrol') {
    return (
      <Panel state={state} heading={t('auth.mfa.enrol.heading')}>
        <p className="text-muted-foreground">{t('auth.mfa.enrol.intro')}</p>
        {enrolmentToken ? (
          <Enrolment
            token={enrolmentToken}
            onInvalidLink={() => {
              setEnrolmentToken(null)
              setLinkInvalid(true)
            }}
            onEnrolled={() => {
              // The reload brings the challenge state; the spent token goes with this state.
              setJustEnrolled(true)
              reloadState()
            }}
          />
        ) : (
          <Alert role={linkInvalid ? 'alert' : 'status'}>
            <AlertDescription>
              {t(linkInvalid ? 'auth.mfa.enrol.invalid_link' : 'auth.mfa.enrol.no_link')}
            </AlertDescription>
          </Alert>
        )}
      </Panel>
    )
  }

  return (
    <Panel state={state} heading={t('auth.mfa.challenge.heading')}>
      {justEnrolled ? (
        <Alert role="status">
          <AlertTitle>{t('auth.mfa.enrolled.title')}</AlertTitle>
          <AlertDescription>{t('auth.mfa.enrolled.body')}</AlertDescription>
        </Alert>
      ) : (
        <p className="text-muted-foreground">{t('auth.mfa.challenge.intro')}</p>
      )}
      <Challenge returnTo={returnTo} />
      <p className="text-muted-foreground text-sm">{t('auth.mfa.challenge.lost')}</p>
    </Panel>
  )
}

function NotStaff() {
  const { user } = usePage<Data.SharedProps>().props
  return (
    <Panel state="not_staff" heading={t('auth.mfa.not_staff.heading')}>
      <p className="text-muted-foreground">
        {t('auth.mfa.not_staff.body', { email: user?.email ?? '' })}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        {/* Signing out reloads this page in place, so an enrolment token in memory stays. */}
        <SignOutButton afterSignOut={reloadState} />
        <a className="text-link text-sm underline underline-offset-4" href="/">
          {t('auth.mfa.not_staff.home')}
        </a>
      </div>
    </Panel>
  )
}

/*
 * Enrolment with the emailed token: the password first, then the setup key
 * and the code. "Start again" asks for the password once more and makes a
 * new key, for someone who lost the screen before confirming.
 */
function Enrolment({
  token,
  onInvalidLink,
  onEnrolled,
}: {
  token: string
  onInvalidLink: () => void
  onEnrolled: () => void
}) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null)
  if (!setup) {
    return (
      <PasswordStep
        token={token}
        onStarted={(secret, uri) => setSetup({ secret, uri })}
        onInvalidLink={onInvalidLink}
      />
    )
  }
  return (
    <CodeStep
      token={token}
      setup={setup}
      onRestart={() => setSetup(null)}
      onInvalidLink={onInvalidLink}
      onEnrolled={onEnrolled}
    />
  )
}

const PASSWORD_FIELDS = [{ name: 'password', id: 'mfa-password' }] as const
const PASSWORD_KNOWN = new Set<string>(['password'])
const PASSWORD_RATE_LIMIT_ID = 'mfa-password-rate-limit'

function PasswordStep({
  token,
  onStarted,
  onInvalidLink,
}: {
  token: string
  onStarted: (secret: string, uri: string) => void
  onInvalidLink: () => void
}) {
  const mutation = useApiMutation({ signInOnUnauthenticated: false })
  const report = useErrorReport(PASSWORD_FIELDS)
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
      const outcome = await mutation.run(() =>
        client.request('startTotpEnrollment', {
          body: { token, password: value.password },
          timeout: 30_000,
        })
      )
      if (!outcome) return
      if (outcome.ok) {
        onStarted(outcome.data.data.secret, outcome.data.data.otpauth_uri)
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        return
      }
      const { code, errors } = outcome.problem
      if (code === 'RATE_LIMITED') return
      if (STATE_CHANGED.has(code)) {
        // Shown if the state stays (a password changed meanwhile); a new state replaces the form.
        setProblem(outcome.problem)
        reloadState()
        return
      }
      if (errors?.some((item) => item.field === 'token')) {
        onInvalidLink()
        return
      }
      if (errors?.length) {
        report.failed(formApi, applyServerErrors(formApi, outcome.problem, PASSWORD_KNOWN))
        return
      }
      setProblem(outcome.problem)
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
        name="password"
        validators={{
          onBlur: ({ value }) =>
            value.length > 0 && value.length <= PASSWORD_MAX
              ? undefined
              : t('auth.mfa.enrol.password_rule'),
        }}
      >
        {(field) => (
          <PasswordField
            id="mfa-password"
            label={t('auth.mfa.enrol.password')}
            description={t('auth.mfa.enrol.password_help')}
            autoComplete="current-password"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={(value) => changeAndRecheck(field, value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <ProblemAlert problem={problem} offline={offline} />
      <SubmitRow
        pending={mutation.pending}
        blocked={blocked}
        retryIn={mutation.retryIn}
        rateLimitId={PASSWORD_RATE_LIMIT_ID}
        label={t('auth.mfa.enrol.start')}
        pendingLabel={t('auth.mfa.enrol.starting')}
      />
    </form>
  )
}

// The setup key in groups of four, as authenticator apps show it; spaces are ignored when typed.
const groupedKey = (secret: string) => secret.replace(/(.{4})(?=.)/g, '$1 ')

function CodeStep({
  token,
  setup,
  onRestart,
  onInvalidLink,
  onEnrolled,
}: {
  token: string
  setup: { secret: string; uri: string }
  onRestart: () => void
  onInvalidLink: () => void
  onEnrolled: () => void
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">{t('auth.mfa.enrol.step_add')}</h2>
        <p className="space-y-1">
          <a className="text-link underline underline-offset-4" href={setup.uri}>
            {t('auth.mfa.enrol.open_app')}
          </a>
          <span className="text-muted-foreground block text-sm">
            {t('auth.mfa.enrol.open_app_help')}
          </span>
        </p>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('auth.mfa.enrol.key_label')}</p>
          <p className="bg-muted rounded-md px-3 py-2 font-mono text-base tracking-wider break-all select-all">
            {groupedKey(setup.secret)}
          </p>
          <p className="text-muted-foreground text-sm">{t('auth.mfa.enrol.key_help')}</p>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">{t('auth.mfa.enrol.step_code')}</h2>
        <CodeForm
          idPrefix="mfa-confirm"
          label={t('auth.mfa.enrol.confirm')}
          pendingLabel={t('auth.mfa.enrol.confirming')}
          send={(code) =>
            client.request('confirmTotpEnrollment', { body: { code, token }, timeout: 30_000 })
          }
          onDone={() => onEnrolled()}
          onInvalidLink={onInvalidLink}
        />
      </section>
      <Button type="button" variant="link" className="px-0" onClick={onRestart}>
        {t('auth.mfa.enrol.restart')}
      </Button>
    </div>
  )
}

function Challenge({ returnTo }: { returnTo: string | null }) {
  return (
    <CodeForm
      idPrefix="mfa-challenge"
      label={t('auth.mfa.challenge.submit')}
      pendingLabel={t('auth.mfa.challenge.submitting')}
      send={(code) =>
        client.request('verifyMfaChallenge', {
          body: { code, ...(returnTo === null ? {} : { return_to: returnTo }) },
          timeout: 30_000,
        })
      }
      onDone={(data) => {
        const redirectTo = (data as { data?: { redirect_to?: string } }).data?.redirect_to ?? '/'
        router.visit(redirectTo, { replace: true })
      }}
    />
  )
}

/*
 * One code field and its button, for the confirmation and the challenge.
 * A wrong or replayed code is the field's error, and the field takes focus
 * again (`useErrorReport`).
 */
function CodeForm({
  idPrefix,
  label,
  pendingLabel,
  send,
  onDone,
  onInvalidLink,
}: {
  idPrefix: string
  label: string
  pendingLabel: string
  send: (code: string) => Promise<unknown>
  onDone: (data: unknown) => void
  onInvalidLink?: () => void
}) {
  const fieldId = `${idPrefix}-code`
  const rateLimitId = `${idPrefix}-rate-limit`
  const fields = useMemo(() => [{ name: 'code', id: fieldId }] as const, [fieldId])
  const mutation = useApiMutation({ signInOnUnauthenticated: false })
  const report = useErrorReport(fields)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)

  const form = useForm({
    defaultValues: { code: '' },
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
      const outcome = await mutation.run(() => send(totpInput(value.code)))
      if (!outcome) return
      if (outcome.ok) {
        onDone(outcome.data)
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        return
      }
      const { code, errors } = outcome.problem
      if (code === 'RATE_LIMITED') return
      if (STATE_CHANGED.has(code)) {
        // Shown if the state stays (a password changed meanwhile); a new state replaces the form.
        setProblem(outcome.problem)
        reloadState()
        return
      }
      if (onInvalidLink && errors?.some((item) => item.field === 'token')) {
        onInvalidLink()
        return
      }
      if (errors?.some((item) => item.field === 'code')) {
        formApi.setFieldMeta('code', (prev) => ({
          ...prev,
          errorMap: { ...prev.errorMap, onServer: t('common.step_up.code_incorrect') },
        }))
        report.failed(formApi)
        return
      }
      setProblem(outcome.problem)
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
      <form.Field name="code" validators={{ onBlur: ({ value }) => codeError(value) }}>
        {(field) => (
          <TotpField
            id={fieldId}
            label={t('auth.mfa.code')}
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={(value) => changeAndRecheck(field, value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <ProblemAlert problem={problem} offline={offline} />
      <SubmitRow
        pending={mutation.pending}
        blocked={blocked}
        retryIn={mutation.retryIn}
        rateLimitId={rateLimitId}
        label={label}
        pendingLabel={pendingLabel}
      />
    </form>
  )
}

function SubmitRow({
  pending,
  blocked,
  retryIn,
  rateLimitId,
  label,
  pendingLabel,
}: {
  pending: boolean
  blocked: boolean
  retryIn: number
  rateLimitId: string
  label: string
  pendingLabel: string
}) {
  return (
    <div className="space-y-2">
      {/* aria-disabled, not disabled, while busy: it keeps focus (08 §7.1). */}
      <Button
        type="submit"
        className={`h-11 w-full text-base ${PENDING_BUTTON}`}
        aria-disabled={blocked || undefined}
        aria-describedby={retryIn > 0 ? rateLimitId : undefined}
      >
        {pending ? pendingLabel : label}
      </Button>
      <RateLimitNotice id={rateLimitId} seconds={retryIn} />
    </div>
  )
}

/*
 * The heading and the body of one state. When the state changes (after the
 * sign-in, after enrolment), focus moves to the new heading, so a screen
 * reader reads it (docs/08 §9.1); the first render leaves focus alone.
 */
function Panel({
  state,
  heading,
  children,
}: {
  state: MfaState
  heading: string
  children: ReactNode
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previous = useRef<MfaState | undefined>(undefined)
  useEffect(() => {
    if (previous.current !== undefined && previous.current !== state) headingRef.current?.focus()
    previous.current = state
  }, [state])
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
