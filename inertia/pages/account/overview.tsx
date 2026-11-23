import { Head } from '@inertiajs/react'
import type { InertiaProps } from '~/types'
import { urlFor } from '~/client'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { ProfileForm } from '~/components/account/profile_form'

/*
 * `/account` (docs/08 §2.4, §3.1 "Account overview, security"; 02 J-04;
 * 01 FR-IAM-013), rendered in the browser in the account layout. The
 * profile form edits the name, the mobile number and the two marketing
 * consents through `updateMe` (profile_form.tsx). A `pending_verification`
 * user may edit it too (AC-FR-IAM-002-2) and sees the "confirm your email"
 * notice with a link to `/verify-email` (02 J-04 "Recovery").
 *
 * `account` is the controller's one prop (app/controllers/account/identity/
 * account_controller.ts): the email, shown and not editable, the name, the
 * status, the phone's last four digits and the consents. The address book
 * (part 6b) and the orders (M6) join this surface later.
 */
type Props = InertiaProps<{
  account: {
    email: string
    full_name: string | null
    status: string
    phone_last4: string | null
    marketing_email_consent: boolean
    marketing_sms_consent: boolean
  }
}>

export default function AccountOverview({ account }: Props) {
  return (
    <>
      <Head title={t('account.overview.title')} />
      <div className="max-w-xl space-y-6">
        <header className="space-y-2">
          <h1
            tabIndex={-1}
            className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
          >
            {t('account.overview.heading')}
          </h1>
          <p className="text-muted-foreground">{t('account.overview.intro')}</p>
        </header>
        {account.status === 'pending_verification' && (
          <Alert role="status">
            <AlertTitle>{t('account.overview.verify_title')}</AlertTitle>
            <AlertDescription>
              <p>{t('account.overview.verify_body')}</p>
              <p>
                <a className="underline underline-offset-4" href={urlFor('verify_email')}>
                  {t('account.overview.verify_action')}
                </a>
              </p>
            </AlertDescription>
          </Alert>
        )}
        <ProfileForm account={account} />
      </div>
    </>
  )
}
