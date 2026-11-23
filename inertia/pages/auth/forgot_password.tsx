import { useEffect, useRef, useState } from 'react'
import { Head } from '@inertiajs/react'
import { urlFor } from '~/client'
import { t } from '~/lib/i18n'
import { ForgotPasswordForm, ResetLinkSent } from '~/components/auth/forgot_password_form'

/*
 * `/forgot-password` (docs/08 §2.3, §3.1 "Verify email, forgot and reset
 * password"; 02 J-18 step 1), signed in or not, server-rendered in the auth
 * layout. The form asks `requestPasswordReset` for a link; whatever the
 * address, the page then shows the same confirmation, with the address the
 * user typed, masked (AC-FR-IAM-004-1). No props of its own.
 *
 * When the confirmation replaces the form, focus moves to its heading, so a
 * screen reader reads it (docs/08 §9.1); "Use another email" brings the
 * form back and focuses its heading the same way.
 */
export default function ForgotPassword() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const changed = useRef(false)

  useEffect(() => {
    if (changed.current) headingRef.current?.focus()
  }, [sentTo])

  function show(value: string | null) {
    changed.current = true
    setSentTo(value)
  }

  return (
    <>
      <Head title={t('auth.forgot.title')} />
      <div className="space-y-6">
        <header className="space-y-2">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
          >
            {sentTo ? t('auth.forgot.sent.heading') : t('auth.forgot.heading')}
          </h1>
          {!sentTo && <p className="text-muted-foreground">{t('auth.forgot.intro')}</p>}
        </header>
        {sentTo ? (
          <ResetLinkSent sentTo={sentTo} onAgain={() => show(null)} />
        ) : (
          <ForgotPasswordForm idPrefix="forgot" onSent={show} />
        )}
        <p className="text-center text-sm">
          <a className="text-link underline underline-offset-4" href={urlFor('login')}>
            {t('auth.forgot.back')}
          </a>
        </p>
      </div>
    </>
  )
}
