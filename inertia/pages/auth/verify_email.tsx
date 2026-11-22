import { Head, usePage } from '@inertiajs/react'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { VerifyEmailPanel } from '~/components/auth/verify_email_panel'

/*
 * `/verify-email` (docs/08 §2.3; 02 J-04 steps 3–4), signed in or not,
 * server-rendered in the auth layout. A token page: it sends no referrer,
 * by the server's `Referrer-Policy: no-referrer` and by the meta tag below,
 * which also covers the requests the page itself makes (docs/07 TM-14,
 * §7.3). The token is read from the page URL, which the server and the
 * browser render alike, and only the browser sends it (verify_email_panel.tsx).
 *
 * `sent_to` is never a server prop: the sign-up form sets it on its
 * client-side visit here, with the address the user typed, masked
 * (02 J-04 step 3). A reload drops it.
 */
type Props = InertiaProps<{
  account_status: 'pending_verification' | 'active' | null
  sent_to?: string
}>

export default function VerifyEmail({ account_status, sent_to, user }: Props) {
  const { url } = usePage()
  const token = new URL(url, 'http://localhost').searchParams.get('token') || null
  return (
    <>
      <Head title={t('auth.verify.title')}>
        <meta name="referrer" content="no-referrer" />
      </Head>
      <VerifyEmailPanel
        token={token}
        accountStatus={account_status}
        sentTo={sent_to ?? null}
        email={user?.email ?? null}
      />
    </>
  )
}
