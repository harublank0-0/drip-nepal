import { useState } from 'react'
import { usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { ChevronDownIcon, MenuIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import { NAVIGATION, type NavigationEntry } from '@shared/catalog/navigation'
import { memberRoutesOpen } from '@shared/ui/shop_access'
import { t } from '~/lib/i18n'
import { SignOutButton } from '~/components/common/sign_out_button'
import { SearchModal } from '~/components/search/search_modal'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '~/components/ui/sheet'

/*
 * The storefront header (docs/08 §2.7; R1-S part 3d-iii-b), in this order:
 * the brand, the primary navigation (Men and Women, each with its entries
 * from `shared/catalog/navigation.ts`, the list the routes are built from),
 * the search, and the account. The audience pages are plain links in the
 * server HTML; their entries open from a menu button beside each, and on
 * narrow screens every entry is in a labelled sheet. The account part is
 * the one the public pages had (M1 part 6a, R1-S part 1a): "Your shop" for
 * a member whose shop opens, "Your account" and "Sign out" for a signed-in
 * user, "Sign in" otherwise. The cart, with its count, comes with the cart
 * (R1-S part 4).
 */
type Audience = { page: NavigationEntry; entries: NavigationEntry[] }

const AUDIENCES: Audience[] = NAVIGATION.filter((entry) => entry.categorySlug === null).map(
  (page) => ({
    page,
    entries: NAVIGATION.filter(
      (entry) => entry.audience === page.audience && entry.categorySlug !== null
    ),
  })
)

const NAV_LINK =
  'hover:bg-muted focus-visible:ring-ring/50 rounded-md px-2 py-1.5 text-sm font-medium outline-none focus-visible:ring-3'
const ACCOUNT_LINK = 'text-link rounded-sm text-sm underline underline-offset-4'

export function StorefrontHeader() {
  const { user, seller_shops: shops } = usePage<Data.SharedProps>().props
  // Only a shop whose overview opens for this user (docs/07 §4.4) gets the link.
  const shop = shops?.find((candidate) => memberRoutesOpen(candidate.status, candidate.role))
  // The phone menu closes when one of its links is followed.
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 md:px-6">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="lg:hidden">
              <MenuIcon aria-hidden="true" />
              <span className="sr-only">{t('storefront.header.menu')}</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[20rem] max-w-[85vw] overflow-y-auto">
            <SheetHeader className="border-b">
              <SheetTitle>{t('storefront.header.menu')}</SheetTitle>
            </SheetHeader>
            <nav
              aria-label={t('storefront.header.main_nav')}
              className="flex flex-col gap-4 px-4 pb-6"
            >
              {AUDIENCES.map(({ page, entries }) => (
                <section key={page.path} className="flex flex-col gap-1">
                  <Link href={page.path} className="text-base font-semibold" onClick={closeMenu}>
                    {page.label}
                  </Link>
                  <ul className="flex flex-col">
                    {entries.map((entry) => (
                      <li key={entry.path}>
                        <Link
                          href={entry.path}
                          className="block py-1.5 text-sm"
                          onClick={closeMenu}
                        >
                          {entry.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
        <a
          href="/"
          className="font-heading text-primary me-2 rounded-sm text-xl font-semibold tracking-tight"
        >
          {t('common.brand')}
        </a>
        <nav
          aria-label={t('storefront.header.main_nav')}
          className="hidden items-center gap-1 lg:flex"
        >
          {AUDIENCES.map(({ page, entries }) => (
            <div key={page.path} className="flex items-center">
              <Link href={page.path} className={NAV_LINK}>
                {page.label}
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm">
                    <ChevronDownIcon aria-hidden="true" />
                    <span className="sr-only">
                      {t('storefront.header.categories_of', { audience: page.label })}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {entries.map((entry) => (
                    <DropdownMenuItem key={entry.path} asChild>
                      <Link href={entry.path}>{entry.label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </nav>
        <div className="ms-auto flex flex-wrap items-center gap-3">
          <SearchModal />
          {user ? (
            <>
              {shop && (
                <Link
                  route="seller.overview"
                  routeParams={{ shopSlug: shop.slug }}
                  className={ACCOUNT_LINK}
                >
                  {t('common.account.shop_link')}
                </Link>
              )}
              <Link route="account.overview" className={ACCOUNT_LINK}>
                {t('common.account.link')}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link route="login" className={ACCOUNT_LINK}>
              {t('storefront.header.sign_in')}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
