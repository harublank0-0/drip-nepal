import { useMemo } from 'react'
import { usePage } from '@inertiajs/react'
import { LayoutDashboardIcon, PackageIcon, ShoppingBagIcon, StoreIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import type { NavItem, NavSection } from './types'

/*
 * Only pages that exist are listed. Add items here as dashboard pages ship.
 */
export function buildDashboardNav(shopSlug: string): NavSection[] {
  const base = `/shops/${shopSlug}`

  return [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboardIcon,
      children: [
        {
          id: 'overview',
          label: 'Dashboard',
          path: `${base}/dashboard`,
          icon: LayoutDashboardIcon,
        },
        { id: 'orders', label: 'Orders', path: `${base}/orders`, icon: PackageIcon },
        { id: 'products', label: 'Products', path: `${base}/products`, icon: ShoppingBagIcon },
      ],
    },
    {
      id: 'shop',
      label: 'Shop',
      icon: StoreIcon,
      children: [{ id: 'storefront', label: 'View storefront', path: '/', icon: StoreIcon }],
    },
  ]
}

/*
 * The dashboard navigation for the shop whose dashboard is open.
 */
export function useDashboardNav() {
  const { currentShop } = usePage<Data.SharedProps>().props
  const shopSlug = currentShop?.slug ?? ''

  return useMemo(() => buildDashboardNav(shopSlug), [shopSlug])
}

export function findNavItemByPath(
  nav: NavSection[],
  path: string
): { section: NavSection; item: NavItem } | null {
  for (const section of nav) {
    for (const item of section.children) {
      if (item.path === path) {
        return { section, item }
      }
    }
  }

  return null
}
