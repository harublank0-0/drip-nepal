import { usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import type { Data } from '@generated/data'
import { ExternalLinkIcon } from 'lucide-react'
import { urlFor } from '~/client'
import { t } from '~/lib/i18n'

/*
 * The footer of the public pages (docs/08 §2.7 "Storefront footer"), as far
 * as M1 has pages for it: help first, then the terms of use and the privacy
 * notice, in that order on every page so help keeps its place (WCAG 2.2
 * SC 3.2.6). Help is the support contact the operator configured
 * (config/storefront.ts), hidden when none is set. M4's storefront footer
 * adds the return policy, `/legal` and `/grievance` between them.
 *
 * On the auth pages (`legalInNewTab`) the legal links open in a new tab,
 * marked as the sign-up form's are, so reading them never discards a form
 * in progress; elsewhere they are ordinary visits.
 */
const LINK = 'underline-offset-4 hover:text-foreground hover:underline'

const LEGAL = [
  { slug: 'terms', label: () => t('common.footer.terms') },
  { slug: 'privacy', label: () => t('common.footer.privacy') },
] as const

export function SiteFooter({ legalInNewTab = false }: { legalInNewTab?: boolean }) {
  const { support } = usePage<Data.SharedProps>().props
  const help = support.email ? `mailto:${support.email}` : support.whatsapp
  return (
    <footer className="text-muted-foreground border-t px-4 py-6 text-sm md:px-6">
      <nav aria-label={t('common.footer.label')}>
        <ul className="flex flex-wrap gap-x-6 gap-y-3">
          {help && (
            <li>
              <a className={LINK} href={help}>
                {t('common.support.contact')}
              </a>
            </li>
          )}
          {LEGAL.map(({ slug, label }) => (
            <li key={slug}>
              {legalInNewTab ? (
                <a
                  className={`${LINK} inline-flex items-center gap-1`}
                  href={urlFor('legal.document', { documentSlug: slug })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {label()}
                  <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">{t('common.new_tab')}</span>
                </a>
              ) : (
                <Link className={LINK} route="legal.document" routeParams={{ documentSlug: slug }}>
                  {label()}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  )
}
