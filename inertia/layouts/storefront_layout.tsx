import type { ReactNode } from 'react'
import { useHeadingFocus } from '~/hooks/use_heading_focus'
import { SkipLink } from '~/components/common/skip_link'
import { SiteHeader } from '~/components/common/site_header'
import { SiteFooter } from '~/components/common/site_footer'
import { t } from '~/lib/i18n'

/*
 * The storefront surface (docs/08 §2.2, §6.2), server-rendered (ADR-0003).
 * In M1 it holds only the interim home page and the draft legal pages, so
 * it is the brand, the page and the footer with help and the legal links
 * (08 §2.7); M4 replaces the
 * header with the storefront header (navigation, search, account, cart) and
 * widens the footer. The skip link targets `<main id="main">`, and after a
 * client-side visit focus moves to the new page's `<h1>` (`useHeadingFocus`,
 * 08 §9.1).
 */
export default function StorefrontLayout({ children }: { children: ReactNode }) {
  useHeadingFocus()
  return (
    <div className="flex min-h-svh flex-col">
      <SkipLink href="#main">{t('common.layout.skip_main')}</SkipLink>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 px-4 pt-2 pb-12 outline-none md:px-6">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
