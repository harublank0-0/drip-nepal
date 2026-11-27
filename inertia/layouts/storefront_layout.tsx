import type { ReactNode } from 'react'
import { useHeadingFocus } from '~/hooks/use_heading_focus'
import { SkipLink } from '~/components/common/skip_link'
import { StorefrontHeader } from '~/components/common/storefront_header'
import { SiteFooter } from '~/components/common/site_footer'
import { t } from '~/lib/i18n'

/*
 * The storefront surface (docs/08 §2.2, §6.2), server-rendered (ADR-0003).
 * The storefront header (08 §2.7: brand, navigation, search, account; the
 * cart with R1-S part 4) heads every page, then the page and the footer
 * with help and the legal links. The skip link targets `<main id="main">`, and after a
 * client-side visit focus moves to the new page's `<h1>` (`useHeadingFocus`,
 * 08 §9.1).
 */
export default function StorefrontLayout({ children }: { children: ReactNode }) {
  useHeadingFocus()
  return (
    <div className="flex min-h-svh flex-col">
      <SkipLink href="#main">{t('common.layout.skip_main')}</SkipLink>
      <StorefrontHeader />
      <main id="main" tabIndex={-1} className="flex-1 px-4 pt-2 pb-12 outline-none md:px-6">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
