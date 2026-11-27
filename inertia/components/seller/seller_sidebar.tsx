import { usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '~/components/ui/sidebar'
import { catalogViewable } from '@shared/ui/shop_access'
import { t } from '~/lib/i18n'
import { can, type CurrentShop, type ShopPermission } from '~/lib/permissions'

/*
 * The seller navigation (docs/08 §2.5, §2.7): only pages that exist, each
 * shown when the member's role holds the permission its page needs (null
 * for a page any member may open, `shop.member`). The UI hides; the server
 * decides (docs/08 §11.6). R1-S part 1a builds the overview, 1b Settings,
 * shown to the roles that may edit the profile (`shop.profile.manage`), and
 * 1c Shipping, shown to the roles that may edit the delivery settings
 * (`shop.shipping.manage`): each page itself opens for any member,
 * read-only without the permission, because it reads a `shop.member`
 * operation (`getSellerShop`, `getShopShipping`; 07 §4.5 "Page routes"),
 * but a link to a form one cannot save is noise. 2f-i adds Products, shown
 * to the roles that may view products (`shop.products.view`) while the
 * shop's status opens the catalogue (`catalogViewable`, the server's
 * `products_view` gate), and current on the list, the new product and the
 * editor. 2f-iv-a adds Stock under the same rule as Products, the stock
 * list reading `listInventory` (`shop.products.view`, `products_view`).
 * Links come from route names through the typed client (docs/08
 * §2.1), with the shop's current slug.
 */
type NavItem = {
  route:
    | 'seller.overview'
    | 'seller.products'
    | 'seller.inventory'
    | 'seller.shipping'
    | 'seller.settings'
  // The page components the item is current on.
  components: string[]
  label: Parameters<typeof t>[0]
  permission: ShopPermission | null
  // Whether the shop's status opens the page; every status a member reaches when absent.
  opens?: (status: string) => boolean
}

const ITEMS: NavItem[] = [
  {
    route: 'seller.overview',
    components: ['seller/overview'],
    label: 'seller.nav.overview',
    permission: null,
  },
  {
    route: 'seller.products',
    components: ['seller/products', 'seller/product_new', 'seller/product_edit'],
    label: 'seller.nav.products',
    permission: 'shop.products.view',
    opens: catalogViewable,
  },
  {
    route: 'seller.inventory',
    components: ['seller/inventory'],
    label: 'seller.nav.inventory',
    permission: 'shop.products.view',
    opens: catalogViewable,
  },
  {
    route: 'seller.shipping',
    components: ['seller/shipping'],
    label: 'seller.nav.shipping',
    permission: 'shop.shipping.manage',
  },
  {
    route: 'seller.settings',
    components: ['seller/settings'],
    label: 'seller.nav.settings',
    permission: 'shop.profile.manage',
  },
]

// The skip link's target (docs/08 §9.1).
export const SELLER_NAV_ID = 'seller-navigation'

export function SellerSidebar({ shop }: { shop: CurrentShop }) {
  const { component } = usePage()
  const items = ITEMS.filter(
    (item) =>
      (item.permission === null || can(shop, item.permission)) &&
      (item.opens === undefined || item.opens(shop.status))
  )

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3 font-semibold">{t('seller.layout.brand')}</SidebarHeader>
      <SidebarContent>
        <nav id={SELLER_NAV_ID} aria-label={t('seller.layout.navigation')} tabIndex={-1}>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => {
                  const current = item.components.includes(component)
                  // The item's own page is the current page; a page below it marks it as current.
                  const page = component === item.components[0]
                  return (
                    <SidebarMenuItem key={item.route}>
                      <SidebarMenuButton asChild isActive={current}>
                        <Link
                          route={item.route}
                          routeParams={{ shopSlug: shop.slug }}
                          aria-current={page ? 'page' : current ? 'true' : undefined}
                        >
                          {t(item.label)}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
    </Sidebar>
  )
}
