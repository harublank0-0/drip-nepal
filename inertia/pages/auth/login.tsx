import { Head } from '@inertiajs/react'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { LogInForm } from '~/components/auth/log_in_form'

/*
 * `/login` (docs/08 §2.3, §3.1 "Sign up, log in"; 02 J-04 step 5), for
 * guests, server-rendered in the auth layout. The form signs in with
 * `logIn` and then goes where the server's `redirect_to` says
 * (log_in_form.tsx). `notice` is `account_suspended` after the account
 * check ended a suspended user's session on a page visit, else null.
 */
type Props = InertiaProps<{
  notice: 'account_suspended' | null
}>

export default function LogIn({ notice }: Props) {
  return (
    <>
      <Head title={t('auth.login.title')} />
      <div className="space-y-6">
        <header className="space-y-2">
          <h1
            tabIndex={-1}
            className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
          >
            {t('auth.login.heading')}
          </h1>
          <p className="text-muted-foreground">{t('auth.login.intro')}</p>
        </header>
        <LogInForm notice={notice} />
      </div>
    </>
  )
}
