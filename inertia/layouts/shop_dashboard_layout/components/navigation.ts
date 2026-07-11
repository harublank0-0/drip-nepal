import {
  BarChart3Icon,
  BellIcon,
  BuildingIcon,
  ClockIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  PackageIcon,
  PaletteIcon,
  ScrollTextIcon,
  SearchIcon,
  Share2Icon,
  ShieldIcon,
  ShoppingBagIcon,
  StarIcon,
  StoreIcon,
  TagIcon,
  TriangleAlertIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
  WarehouseIcon,
} from 'lucide-react'
import type { NavItem, NavSection } from './types'

export const DASHBOARD_NAV: NavSection[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboardIcon,
    children: [
      { id: 'overview', label: 'Dashboard', path: '/shop/dashboard', icon: LayoutDashboardIcon },
      { id: 'orders', label: 'Orders', path: '/shop/orders', icon: PackageIcon },
      { id: 'products', label: 'Products', path: '/shop/products', icon: ShoppingBagIcon },
      { id: 'inventory', label: 'Inventory', path: '/shop/inventory', icon: WarehouseIcon },
      { id: 'customers', label: 'Customers', path: '/shop/customers', icon: UsersIcon },
      { id: 'reviews', label: 'Reviews', path: '/shop/reviews', icon: StarIcon },
      { id: 'discounts', label: 'Discounts', path: '/shop/discounts', icon: TagIcon },
      { id: 'marketing', label: 'Marketing', path: '/shop/marketing', icon: MegaphoneIcon },
      { id: 'analytics', label: 'Analytics', path: '/shop/analytics', icon: BarChart3Icon },
      { id: 'finance', label: 'Finance', path: '/shop/finance', icon: WalletIcon },
      { id: 'messages', label: 'Messages', path: '/shop/messages', icon: MessageSquareIcon },
    ],
  },
  {
    id: 'shop',
    label: 'Shop',
    icon: StoreIcon,
    children: [
      { id: 'overview', label: 'Overview', path: '/shop/settings/overview', icon: StoreIcon },
      { id: 'general', label: 'General', path: '/shop/settings/general', icon: BuildingIcon },
      { id: 'branding', label: 'Branding', path: '/shop/settings/branding', icon: PaletteIcon },
      {
        id: 'business-hours',
        label: 'Business Hours',
        path: '/shop/settings/business-hours',
        icon: ClockIcon,
      },
      { id: 'shipping', label: 'Shipping', path: '/shop/settings/shipping', icon: TruckIcon },
      { id: 'payments', label: 'Payments', path: '/shop/settings/payments', icon: CreditCardIcon },
      {
        id: 'notifications',
        label: 'Notifications',
        path: '/shop/settings/notifications',
        icon: BellIcon,
      },
      { id: 'seo', label: 'SEO', path: '/shop/settings/seo', icon: SearchIcon },
      { id: 'policies', label: 'Policies', path: '/shop/settings/policies', icon: ScrollTextIcon },
      { id: 'social', label: 'Social Links', path: '/shop/settings/social', icon: Share2Icon },
      { id: 'security', label: 'Security', path: '/shop/settings/security', icon: ShieldIcon },
      {
        id: 'danger',
        label: 'Danger Zone',
        path: '/shop/settings/danger',
        icon: TriangleAlertIcon,
      },
    ],
  },
]

export function findNavItemByPath(path: string): { section: NavSection; item: NavItem } | null {
  for (const section of DASHBOARD_NAV) {
    for (const item of section.children) {
      if (item.path === path) {
        return { section, item }
      }
    }
  }
  return null
}

export function findNavSectionByChildPath(path: string): NavSection | null {
  for (const section of DASHBOARD_NAV) {
    for (const item of section.children) {
      if (item.path === path) {
        return section
      }
    }
  }
  return null
}
