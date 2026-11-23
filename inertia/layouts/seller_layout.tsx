import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import type { Data } from '@generated/data'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/components/ui/sidebar'
import { SellerSidebar, SELLER_NAV_ID } from '~/components/seller/seller_sidebar'
import { ShopSwitcher } from '~/components/seller/shop_switcher'
import { SkipLink } from '~/components/common/skip_link'
import { SignOutButton } from '~/components/common/sign_out_button'
import { useHeadingFocus } from '~/hooks/use_heading_focus'
import { t } from '~/lib/i18n'

/*
 * The seller surface (docs/08 §2.5, §2.7, §6.3, §9.1), rendered in the
 * browser (ADR-0003). Below `md` the sidebar is a sheet behind the menu
 * button; from `md` it is shown, and the menu button hides and shows it.
 * The top bar holds the shop switcher (`seller_shops`, with one shop just
 * its name) and the signed-in user's sign-out. The page is one `main`
 * landmark (the sidebar inset) with the skip links' target, holding the
 * top bar and the scrolling pane, Inertia's scroll region so Back restores
 * its position; after a client-side visit focus moves to the page's `<h1>`
 * (`useHeadingFocus`). `current_shop` is set on every seller page, because
 * `seller_context` resolved the shop before the page rendered.
 */
export default function SellerLayout({ children }: { children: ReactNode }) {
  useHeadingFocus()
  const { props } = usePage<Data.SharedProps>()
  const shop = props.current_shop
  if (!shop) return <>{children}</>
  return (
    <SidebarProvider className="h-svh">
      <SkipLink href="#main">{t('seller.layout.skip_main')}</SkipLink>
      {/* The navigation is in the page only from `md`; below it, it is a closed sheet. */}
      <SkipLink href={`#${SELLER_NAV_ID}`} className="max-md:hidden">
        {t('seller.layout.skip_navigation')}
      </SkipLink>
      <SellerSidebar shop={shop} />
      <SidebarInset id="main" tabIndex={-1} className="overflow-hidden outline-none">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <ShopSwitcher current={shop} shops={props.seller_shops ?? []} />
          {props.user && (
            <>
              <span className="text-muted-foreground ms-auto truncate text-sm max-sm:hidden">
                {t('seller.layout.signed_in_as', { email: props.user.email })}
              </span>
              {/* `logOut`, then history cleared and `/login` (docs/07 §3.11). */}
              <SignOutButton className="ms-auto shrink-0 sm:ms-0" />
            </>
          )}
        </div>
        {/* eslint-disable-next-line react/no-unknown-property -- Inertia 3 restores scroll by the `scroll-region` attribute (docs/08 §6.3) */}
        <div scroll-region="" className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
