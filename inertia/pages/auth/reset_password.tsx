import { Head, usePage } from '@inertiajs/react'
import { t } from '~/lib/i18n'
import { ResetPasswordPanel } from '~/components/auth/reset_password_panel'

/*
 * `/reset-password` (docs/08 §2.3; 02 J-18 steps 3–4), signed in or not,
 * server-rendered in the auth layout. A token page: it sends no referrer,
 * by the server's `Referrer-Policy: no-referrer` and by the meta tag below,
 * which also covers the requests the page itself makes (docs/07 TM-14,
 * §7.3). The token is read from the page URL, which the server and the
 * browser render alike, and only the browser sends it, with the new
 * password (reset_password_panel.tsx). No props of its own.
 */
export default function ResetPassword() {
  const { url } = usePage()
  const token = new URL(url, 'http://localhost').searchParams.get('token') || null
  return (
    <>
      <Head title={t('auth.reset.title')}>
        <meta name="referrer" content="no-referrer" />
      </Head>
      <ResetPasswordPanel token={token} />
    </>
  )
}
