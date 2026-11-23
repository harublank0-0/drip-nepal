import { createElement, type ComponentType, type ReactElement, type ReactNode } from 'react'
import RootLayout from '~/layouts/root_layout'
import AccountLayout from '~/layouts/account_layout'
import AdminLayout from '~/layouts/admin_layout'
import AuthLayout from '~/layouts/auth_layout'
import SellerLayout from '~/layouts/seller_layout'
import StorefrontLayout from '~/layouts/storefront_layout'

/*
 * The layout of a page, chosen by its name (docs/09 §13.2): every page sits
 * in RootLayout, and a surface page also in its surface layout, so the
 * layout stays mounted across visits within the surface. Surfaces join as
 * they are built: admin since the courier pages (M6), auth and storefront
 * since the sign-up pages and the draft legal pages (M1 part 2b), account
 * since the profile and security pages (M1 part 6a), seller since the
 * overview (R1-S part 1a).
 */
const SURFACE_LAYOUTS: [prefix: string, layout: ComponentType<{ children: ReactNode }>][] = [
  ['account/', AccountLayout],
  ['admin/', AdminLayout],
  ['auth/', AuthLayout],
  ['seller/', SellerLayout],
  ['storefront/', StorefrontLayout],
]

export function layoutFor(name: string) {
  const surface = SURFACE_LAYOUTS.find(([prefix]) => name.startsWith(prefix))?.[1] ?? null
  // An arrow, not a named function: Inertia 3 calls a prototype-less function as a
  // layout resolver with the page, but mounts a named function as a component.
  // eslint-disable-next-line react/display-name -- a layout resolver, not a component
  return (page: ReactElement) =>
    createElement(RootLayout, null, surface ? createElement(surface, null, page) : page)
}
