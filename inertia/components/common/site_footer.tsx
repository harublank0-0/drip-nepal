import { usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import type { Data } from '@generated/data'
import { t } from '~/lib/i18n'

/*
 * The footer of the public pages (docs/08 §2.7 "Storefront footer"), as far
 * as M1 has pages for it: help first, then the terms of use and the privacy
 * notice, in that order on every page so help keeps its place (WCAG 2.2
 * SC 3.2.6). Help is the support contact the operator configured
 * (config/storefront.ts), hidden when none is set. M4's storefront footer
 * adds the return policy, `/legal` and `/grievance` between them.
 */
const LINK = 'underline-offset-4 hover:text-foreground hover:underline'

export function SiteFooter() {
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
          <li>
            <Link className={LINK} route="legal.document" routeParams={{ documentSlug: 'terms' }}>
              {t('common.footer.terms')}
            </Link>
          </li>
          <li>
            <Link className={LINK} route="legal.document" routeParams={{ documentSlug: 'privacy' }}>
              {t('common.footer.privacy')}
            </Link>
          </li>
        </ul>
      </nav>
    </footer>
  )
}
