import { usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import type { Data } from '@generated/data'
import { t } from '~/lib/i18n'
import { SignOutButton } from '~/components/common/sign_out_button'

/*
 * The header of the public, auth and account pages until M4 builds the
 * storefront header of docs/08 §2.7 (brand, navigation, search, account,
 * cart): the brand mark, linking home, and for a signed-in user a link to
 * the account pages (M1 part 6a) and the sign-out button, the account
 * controls until the account menu exists (M1 part 3). A user who owns or
 * works in a shop that is not closed also gets "Your shop", to the first
 * such shop's seller overview (R1-S part 1a; the `seller_shops` shared prop,
 * ordered by name), where the seller layout's switcher reaches the others. The brand links `/`,
 * the interim home page until M4's (pages/storefront/home.tsx), as a plain
 * link. The crimson accent marks the brand only (08 §1.1).
 */
export function SiteHeader() {
  const { user, seller_shops: shops } = usePage<Data.SharedProps>().props
  // A closed shop's overview is refused (docs/07 §4.4), so it gets no link.
  const shop = shops?.find((candidate) => candidate.status !== 'closed')
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-6">
      <a
        href="/"
        className="font-heading text-primary rounded-sm text-xl font-semibold tracking-tight"
      >
        {t('common.brand')}
      </a>
      {user && (
        <div className="flex flex-wrap items-center gap-3">
          {shop && (
            <Link
              route="seller.overview"
              routeParams={{ shopSlug: shop.slug }}
              className="text-link rounded-sm text-sm underline underline-offset-4"
            >
              {t('common.account.shop_link')}
            </Link>
          )}
          <Link
            route="account.overview"
            className="text-link rounded-sm text-sm underline underline-offset-4"
          >
            {t('common.account.link')}
          </Link>
          <SignOutButton />
        </div>
      )}
    </header>
  )
}
