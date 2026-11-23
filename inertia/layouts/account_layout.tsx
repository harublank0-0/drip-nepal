import type { ReactNode } from 'react'
import { useHeadingFocus } from '~/hooks/use_heading_focus'
import { SkipLink } from '~/components/common/skip_link'
import { SiteHeader } from '~/components/common/site_header'
import { SiteFooter } from '~/components/common/site_footer'
import { AccountNav } from '~/components/account/account_nav'
import { t } from '~/lib/i18n'

/*
 * The account surface (docs/08 §2.4, §6.2 "Account and legal pages"; docs/09
 * §13.1), rendered in the browser (ADR-0003). One column on phones, with
 * the account navigation at the top; from `lg` the navigation is a list on
 * the left. The header and footer are the public pages' (08 §2.7). The skip
 * link targets `<main id="main">`, and after a client-side visit focus
 * moves to the new page's `<h1>` (`useHeadingFocus`, 08 §9.1).
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  useHeadingFocus()
  return (
    <div className="flex min-h-svh flex-col">
      <SkipLink href="#main">{t('common.layout.skip_main')}</SkipLink>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-2 pb-12 md:px-6 lg:flex-row lg:gap-10">
        <AccountNav />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </main>
      </div>
      <SiteFooter />
    </div>
  )
}
