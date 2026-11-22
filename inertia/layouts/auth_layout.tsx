import { useEffect, useRef, type ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import { SkipLink } from '~/components/common/skip_link'
import { SiteHeader } from '~/components/common/site_header'
import { SiteFooter } from '~/components/common/site_footer'
import { t } from '~/lib/i18n'

/*
 * The auth surface (docs/08 §2.3; docs/09 §13.1): sign-up and email
 * verification in M1, then sign-in, password reset and MFA. One narrow
 * column on a quiet page: the brand, the page in a card, then the footer
 * with help and the legal links (08 §2.7). Server-rendered (ADR-0003). The
 * skip link targets `<main id="main">` (08 §9.1).
 *
 * After a client-side visit to another auth page (the sign-up form moving to
 * `/verify-email`), focus moves to the new page's `<h1>`, which each page
 * gives `tabIndex={-1}`; a query-only change, such as `/verify-email`
 * dropping its token, keeps focus where it is (08 §9.1).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const { component, url } = usePage()
  const place = `${component} ${url.split('?')[0]}`
  const previous = useRef<string | null>(null)
  useEffect(() => {
    if (previous.current !== null && previous.current !== place) {
      document.querySelector<HTMLElement>('#main h1')?.focus()
    }
    previous.current = place
  }, [place])

  return (
    <div className="bg-muted/40 flex min-h-svh flex-col">
      <SkipLink href="#main">{t('common.layout.skip_main')}</SkipLink>
      <SiteHeader />
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 justify-center px-4 pt-2 pb-12 outline-none md:items-center md:pt-6"
      >
        <div className="bg-card text-card-foreground w-full max-w-md self-start rounded-xl border p-5 shadow-xs md:self-center md:p-8">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
