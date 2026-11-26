import { createElement, type ComponentType, type ReactNode } from 'react'
import RootLayout from '~/layouts/root_layout'
import AccountLayout from '~/layouts/account_layout'
import AuthLayout from '~/layouts/auth_layout'
import StorefrontLayout from '~/layouts/storefront_layout'

/*
 * The layout of a page, chosen by its name (docs/09 §13.2): every page sits
 * in RootLayout, and a surface page also in its surface layout, so the
 * layout stays mounted across visits within the surface. Surfaces join as
 * they are built: admin since the courier pages (M6), auth and storefront
 * since the sign-up pages and the draft legal pages (M1 part 2b), account
 * since the profile and security pages (M1 part 6a), seller since the
 * overview (R1-S part 1a).
 *
 * The customer surfaces' layouts (storefront, auth, account), which share
 * the site header and footer, are in every bundle. The dashboard layouts
 * (seller, admin) load with their surface's pages: their sidebars, the shop
 * switcher and the primitives under them stay out of every customer page's
 * JavaScript (docs/08 §10.1, T-UI-012). The bundle check counts a dashboard
 * page's layout chunk with the page, and refuses a customer page that loads
 * a dashboard layout. A module loads once, so the layout keeps its
 * identity, and stays mounted, across visits within the surface.
 */
type Layout = ComponentType<{ children: ReactNode }>

const CUSTOMER_LAYOUTS: [prefix: string, layout: Layout][] = [
  ['account/', AccountLayout],
  ['auth/', AuthLayout],
  ['storefront/', StorefrontLayout],
]

const DASHBOARD_LAYOUTS: [prefix: string, load: () => Promise<{ default: Layout }>][] = [
  ['admin/', () => import('~/layouts/admin_layout')],
  ['seller/', () => import('~/layouts/seller_layout')],
]

export async function layoutFor(name: string) {
  const load = DASHBOARD_LAYOUTS.find(([prefix]) => name.startsWith(prefix))?.[1]
  const loaded = load ? await load() : null
  const surface =
    loaded?.default ?? CUSTOMER_LAYOUTS.find(([prefix]) => name.startsWith(prefix))?.[1] ?? null
  // An arrow, not a named function: Inertia 3 calls a prototype-less function as a
  // layout resolver with the page, but mounts a named function as a component.
  // eslint-disable-next-line react/display-name -- a layout resolver, not a component
  return (page: ReactNode) =>
    createElement(RootLayout, null, surface ? createElement(surface, null, page) : page)
}
