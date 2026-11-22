import { Head } from '@inertiajs/react'
import type { InertiaProps } from '~/types'
import { urlFor } from '~/client'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { SignOutButton } from '~/components/common/sign_out_button'

/*
 * `/`, the interim home page until M4 builds the storefront home of docs/08
 * §3.1 in this same component (not an OD, decided 2026-11-23 by the tech
 * lead, risks §2.3). Every redirect after sign-in, after a verified link and
 * away from the guest pages lands here, so it says the store is being
 * built, with no date, and offers the next step: sign up or sign in for a
 * guest; for a signed-in user a greeting by first name and the sign-out
 * button, and for staff whose role may open them, a link to the admin pages
 * (`admin_link`, decided by the server).
 */
type Props = InertiaProps<{
  admin_link: boolean
}>

// The first word of the name, as a greeting uses it; null when there is none.
function firstName(fullName: string | null) {
  const first = fullName?.trim().split(/\s+/u)[0] ?? ''
  return first === '' ? null : first
}

function heading(user: Props['user']) {
  if (!user) return t('storefront.home.guest_heading')
  const name = firstName(user.full_name)
  return name ? t('storefront.home.greeting', { name }) : t('storefront.home.greeting_plain')
}

export default function Home({ user, admin_link }: Props) {
  return (
    <>
      <Head title={t('storefront.home.title')} />
      <section className="mx-auto max-w-xl space-y-6 py-8 md:py-16">
        <header className="space-y-3">
          <h1
            tabIndex={-1}
            className="font-heading text-3xl font-semibold tracking-tight outline-none md:text-4xl"
          >
            {heading(user)}
          </h1>
          <p className="text-muted-foreground text-lg">
            {user ? t('storefront.home.member_body') : t('storefront.home.guest_body')}
          </p>
        </header>
        {user ? (
          <div className="flex flex-wrap items-center gap-3">
            {admin_link && (
              <Button asChild className="h-11 text-base">
                <a href={urlFor('admin.logistics')}>{t('storefront.home.admin')}</a>
              </Button>
            )}
            <SignOutButton />
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-11 text-base">
              <a href={urlFor('signup')}>{t('storefront.home.sign_up')}</a>
            </Button>
            <Button asChild variant="outline" className="h-11 text-base">
              <a href={urlFor('login')}>{t('storefront.home.sign_in')}</a>
            </Button>
          </div>
        )}
      </section>
    </>
  )
}
