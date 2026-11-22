import { Head } from '@inertiajs/react'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { SignUpForm } from '~/components/auth/sign_up_form'
import type { LegalDocumentLink } from '~/components/auth/legal_document_links'

/*
 * `/signup` (docs/08 §2.3, §3.1 "Sign up, log in"; 02 J-04 step 1), for
 * guests, server-rendered in the auth layout. The form creates the account
 * with `signUp` and then shows `/verify-email` (sign_up_form.tsx).
 */
type Props = InertiaProps<{
  legal_documents: LegalDocumentLink[]
}>

export default function SignUp({ legal_documents }: Props) {
  return (
    <>
      <Head title={t('auth.signup.title')} />
      <div className="space-y-6">
        <header className="space-y-2">
          <h1
            tabIndex={-1}
            className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
          >
            {t('auth.signup.heading')}
          </h1>
          <p className="text-muted-foreground">{t('auth.signup.intro')}</p>
        </header>
        <SignUpForm legalDocuments={legal_documents} />
      </div>
    </>
  )
}
