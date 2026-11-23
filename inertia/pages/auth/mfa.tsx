import { Head, usePage } from '@inertiajs/react'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { MfaPanel, type MfaState } from '~/components/auth/mfa_panel'

/*
 * `/mfa` (docs/08 §2.3, §3.1 "MFA"; docs/07 §3.9; M1 part 5), signed in or
 * not, server-rendered in the auth layout. A token page: it sends no
 * referrer, by the server's `Referrer-Policy: no-referrer` and by the meta
 * tag below, which also covers the requests the page itself makes (docs/07
 * TM-14, §7.3). The enrolment token and `return_to` are read from the page
 * URL, which the server and the browser render alike; only the browser
 * sends them (mfa_panel.tsx). `mfa_state` is the server's decision.
 */
type Props = InertiaProps<{ mfa_state: MfaState }>

export default function Mfa({ mfa_state }: Props) {
  const { url } = usePage()
  const query = new URL(url, 'http://localhost').searchParams
  return (
    <>
      <Head title={t('auth.mfa.title')}>
        <meta name="referrer" content="no-referrer" />
      </Head>
      <MfaPanel
        state={mfa_state}
        token={query.get('token') || null}
        returnTo={query.get('return_to')}
      />
    </>
  )
}
