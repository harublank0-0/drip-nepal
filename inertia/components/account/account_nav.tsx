import { usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { t } from '~/lib/i18n'
import { cn } from '~/lib/utils'

/*
 * The account navigation (docs/08 §2.4, §6.2): the account pages built so
 * far, profile and security (M1 part 6a); the address book joins with part
 * 6b, orders, shops and support with their milestones. Below `lg` it is a
 * row of links at the top, from `lg` a list on the left. Links, not a
 * select that navigates on change, which would move the user on input
 * (WCAG 2.2 SC 3.2.2). The current page is marked with `aria-current` and
 * by weight and a border, never by colour alone (SC 1.4.1).
 */
const ITEM =
  'block rounded-md border border-transparent px-3 py-2 text-sm underline-offset-4 hover:underline'
const CURRENT = 'border-border bg-muted font-semibold'

export function AccountNav() {
  const { component } = usePage()
  const onOverview = component === 'account/overview'
  const onSecurity = component === 'account/security'
  return (
    <nav aria-label={t('account.nav.label')} className="lg:w-48 lg:shrink-0">
      <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
        <li>
          <Link
            route="account.overview"
            className={cn(ITEM, onOverview && CURRENT)}
            aria-current={onOverview ? 'page' : undefined}
          >
            {t('account.nav.overview')}
          </Link>
        </li>
        <li>
          <Link
            route="account.security"
            className={cn(ITEM, onSecurity && CURRENT)}
            aria-current={onSecurity ? 'page' : undefined}
          >
            {t('account.nav.security')}
          </Link>
        </li>
      </ul>
    </nav>
  )
}
