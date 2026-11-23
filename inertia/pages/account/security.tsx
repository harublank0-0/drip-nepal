import { Head } from '@inertiajs/react'
import { t } from '~/lib/i18n'
import { ChangePasswordForm } from '~/components/account/change_password_form'
import { SignOutEverywhere } from '~/components/account/sign_out_everywhere'
import { DeleteAccount } from '~/components/account/delete_account'

/*
 * `/account/security` (docs/08 §2.4, §3.1 "Account overview, security"; 02
 * J-18 step 5; 01 FR-IAM-005, FR-IAM-009), rendered in the browser in the
 * account layout. Three sections, each its own form or dialog:
 * - change password (`changePassword`, M1 part 4): this device stays signed
 *   in, the others are signed out;
 * - sign out of all other devices (`revokeAllSessions`, M1 part 4);
 * - delete the account (`requestAccountDeletion`, M1 part 6a): closes it at
 *   once and signs this device out too.
 * Customers have no MFA in R1, so nothing here asks for a code (08 §3.1
 * "step-up not needed for customers"); a staff member's TOTP is managed on
 * `/mfa` (07 §3.9). No props of its own.
 */
export default function AccountSecurity() {
  return (
    <>
      <Head title={t('account.security.title')} />
      <div className="max-w-xl space-y-10">
        <header className="space-y-2">
          <h1
            tabIndex={-1}
            className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
          >
            {t('account.security.heading')}
          </h1>
          <p className="text-muted-foreground">{t('account.security.intro')}</p>
        </header>
        <section aria-labelledby="password-heading" className="space-y-4">
          <h2 id="password-heading" className="font-heading text-xl font-semibold tracking-tight">
            {t('account.password.heading')}
          </h2>
          <ChangePasswordForm />
        </section>
        <section aria-labelledby="sessions-heading" className="space-y-4">
          <h2 id="sessions-heading" className="font-heading text-xl font-semibold tracking-tight">
            {t('account.sessions.heading')}
          </h2>
          <p className="text-muted-foreground">{t('account.sessions.intro')}</p>
          <SignOutEverywhere />
        </section>
        <section aria-labelledby="delete-heading" className="space-y-4">
          <h2 id="delete-heading" className="font-heading text-xl font-semibold tracking-tight">
            {t('account.delete.heading')}
          </h2>
          <p className="text-muted-foreground">{t('account.delete.intro')}</p>
          <DeleteAccount />
        </section>
      </div>
    </>
  )
}
