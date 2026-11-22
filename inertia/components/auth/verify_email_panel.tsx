import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { router } from '@inertiajs/react'
import type { Problem } from '@shared/api/problem'
import { client, urlFor } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'
import { ResendVerification } from '~/components/auth/resend_verification'

/*
 * What `/verify-email` shows (docs/08 §2.3, §3.1 "Verify email"; 02 J-04
 * steps 3–4 and its recovery row; 01 AC-FR-IAM-002-4). No state has an
 * email field or says anything about an account the visitor is not signed
 * in to.
 *
 * With a token (`/verify-email?token=…` from the email), the page posts it
 * to `confirmEmail` once, then drops it from the address bar: Inertia's
 * replace visit rewrites the history entry with `history.replaceState` and
 * keeps this state. The token stays in memory only, for "Try again" after a
 * failure without an answer.
 * - 200: verified. `confirmEmail` answers the same for a link that has just
 *   verified the account and for any link of an account already verified
 *   (docs/06 note 56), so a repeated link shows the same "Your email is
 *   verified" (02 AC-J04-06); "already verified" is for a verified user who
 *   opens the page without a link.
 * - 422: the link is unknown, expired or replaced; a new one needs a
 *   session, so a visitor is asked to sign in for one.
 * - anything else: the problem with its reference, and "Try again"; a
 *   `RATE_LIMITED` wait (no limiter covers `confirmEmail` today) shows next
 *   to the button, which stays disabled until it ends.
 *
 * Without a token, the session decides (`accountStatus`): a signed-in
 * `pending_verification` user can ask for a new link; a verified one is
 * told so; a visitor without a session sees "Check your email" with the
 * address masked when the sign-up form brought them here (`sentTo`), or
 * the general text after a reload, and "Sign in to get a new link".
 */
type AccountStatus = 'pending_verification' | 'active' | null
type Phase = 'checking' | 'verified' | 'invalid' | 'failed'

const RATE_LIMIT_ID = 'confirm-rate-limit'

export function VerifyEmailPanel({
  token,
  accountStatus,
  sentTo,
  email,
}: {
  token: string | null
  accountStatus: AccountStatus
  sentTo: string | null
  email: string | null
}) {
  const mutation = useApiMutation()
  const kept = useRef(token)
  const started = useRef(false)
  const [phase, setPhase] = useState<Phase | null>(token ? 'checking' : null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)

  async function confirm(value: string) {
    const outcome = await mutation.run(() =>
      client.request('confirmEmail', { body: { token: value }, timeout: 30_000 })
    )
    // Refused before sending (useApiMutation): back to "Try again", never stuck on "Checking".
    if (!outcome) {
      setPhase('failed')
      return
    }
    if (outcome.ok) {
      setPhase('verified')
      return
    }
    if ('offline' in outcome) {
      setOffline(true)
      setPhase('failed')
      return
    }
    // `token_invalid` for an unknown, expired or replaced link; a malformed one fails its rule.
    if (outcome.problem.code === 'VALIDATION_FAILED') {
      setPhase('invalid')
      return
    }
    // useApiMutation shows a RATE_LIMITED wait next to the button.
    if (outcome.problem.code !== 'RATE_LIMITED') setProblem(outcome.problem)
    setPhase('failed')
  }

  // Once per page load, in the browser only (docs/09 §13.8 rule 1).
  const onFirstRender = useEffectEvent(() => {
    const value = kept.current
    if (!value || started.current) return
    started.current = true
    void confirm(value)
    router.replace({ url: urlFor('verify_email'), preserveState: true, preserveScroll: true })
  })
  useEffect(() => {
    onFirstRender()
  }, [])

  function retry() {
    const value = kept.current
    if (!value || mutation.pending || mutation.retryIn > 0) return
    setProblem(null)
    setOffline(false)
    setPhase('checking')
    void confirm(value)
  }

  const signedIn = accountStatus !== null
  const continueLink = (
    <Button asChild className="h-11 w-full text-base">
      {/* `/` is the storefront home of M4; until then the link opens the 404 page. */}
      <a href="/">{t('auth.verify.continue')}</a>
    </Button>
  )

  if (phase === 'checking') {
    return (
      <Panel phase={phase} heading={t('auth.verify.checking.heading')}>
        <p className="text-muted-foreground flex items-center gap-2">
          <Spinner aria-hidden="true" role="presentation" />
          {t('auth.verify.checking.body')}
        </p>
      </Panel>
    )
  }
  if (phase === 'verified') {
    return (
      <Panel phase={phase} heading={t('auth.verify.verified.heading')}>
        <p className="text-muted-foreground">
          {signedIn
            ? t('auth.verify.verified.signed_in_body')
            : t('auth.verify.verified.guest_body')}
        </p>
        {signedIn ? (
          continueLink
        ) : (
          <Button asChild className="h-11 w-full text-base">
            {/* `/login` is a route of M1 part 3; until then the link opens the 404 page. */}
            <a href="/login">{t('auth.verify.sign_in')}</a>
          </Button>
        )}
      </Panel>
    )
  }
  if (phase === 'invalid') {
    return (
      <Panel phase={phase} heading={t('auth.verify.invalid.heading')}>
        <p className="text-muted-foreground">{t('auth.verify.invalid.body')}</p>
        {accountStatus === 'pending_verification' && email && <ResendVerification email={email} />}
        {accountStatus === 'active' && continueLink}
        {accountStatus === null && <SignInForLink />}
      </Panel>
    )
  }
  if (phase === 'failed') {
    return (
      <Panel phase={phase} heading={t('auth.verify.failed.heading')}>
        <ProblemAlert problem={problem} offline={offline} />
        <div className="space-y-2">
          {/* Not disabled while pending or rate limited, so it keeps focus; presses are ignored (08 §7.1). */}
          <Button
            type="button"
            className={`h-11 w-full text-base ${PENDING_BUTTON}`}
            aria-disabled={mutation.pending || mutation.retryIn > 0 || undefined}
            aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
            onClick={retry}
          >
            {t('auth.verify.retry')}
          </Button>
          <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
        </div>
      </Panel>
    )
  }
  if (accountStatus === 'active') {
    return (
      <Panel phase={phase} heading={t('auth.verify.already.heading')}>
        <p className="text-muted-foreground">{t('auth.verify.already.body')}</p>
        {continueLink}
      </Panel>
    )
  }
  if (accountStatus === 'pending_verification' && email) {
    return (
      <Panel phase={phase} heading={t('auth.verify.pending.heading')}>
        <p>{t('auth.verify.pending.body', { email })}</p>
        <p className="text-muted-foreground text-sm">{t('auth.verify.delay')}</p>
        <ResendVerification email={email} />
      </Panel>
    )
  }
  return (
    <Panel
      phase={phase}
      heading={sentTo ? t('auth.verify.sent.heading') : t('auth.verify.guest.heading')}
    >
      <p>{sentTo ? t('auth.verify.sent.body', { email: sentTo }) : t('auth.verify.guest.body')}</p>
      <p className="text-muted-foreground text-sm">{t('auth.verify.delay')}</p>
      <SignInForLink />
    </Panel>
  )
}

/*
 * The heading and the body of one state. When the answer to the link
 * arrives, focus moves to the new heading, so a screen reader reads the
 * outcome (docs/08 §9.1); the first render leaves focus alone.
 */
function Panel({
  phase,
  heading,
  children,
}: {
  phase: Phase | null
  heading: string
  children: ReactNode
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previous = useRef<Phase | null | undefined>(undefined)
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

// A new link needs a session (docs/08 §2.3, decided 2026-11-23): sign in, then come back here.
function SignInForLink() {
  // `/login` is a route of M1 part 3; until then the link opens the 404 page.
  const href = `/login?return_to=${encodeURIComponent(urlFor('verify_email'))}`
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">{t('auth.verify.no_link')}</p>
      <Button asChild variant="outline" className="h-11 w-full text-base">
        <a href={href}>{t('auth.verify.sign_in_for_link')}</a>
      </Button>
    </div>
  )
}
