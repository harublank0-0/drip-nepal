import {
  BarChart3Icon,
  BellIcon,
  BuildingIcon,
  ClockIcon,
  CreditCardIcon,
  PaletteIcon,
  ScrollTextIcon,
  SearchIcon,
  Share2Icon,
  ShieldIcon,
  StoreIcon,
  TriangleAlertIcon,
  TruckIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ShopNavItem {
  path: string
  label: string
  icon: LucideIcon
}

export const SHOP_NAV_ITEMS: ShopNavItem[] = [
  { path: '/vendor/shop/overview', label: 'Overview', icon: StoreIcon },
  { path: '/vendor/shop/general', label: 'General', icon: BuildingIcon },
  { path: '/vendor/shop/branding', label: 'Branding', icon: PaletteIcon },
  { path: '/vendor/shop/business-hours', label: 'Business Hours', icon: ClockIcon },
  { path: '/vendor/shop/shipping', label: 'Shipping', icon: TruckIcon },
  { path: '/vendor/shop/payments', label: 'Payments', icon: CreditCardIcon },
  { path: '/vendor/shop/notifications', label: 'Notifications', icon: BellIcon },
  { path: '/vendor/shop/seo', label: 'SEO', icon: SearchIcon },
  { path: '/vendor/shop/policies', label: 'Policies', icon: ScrollTextIcon },
  { path: '/vendor/shop/social', label: 'Social Links', icon: Share2Icon },
  { path: '/vendor/shop/analytics', label: 'Analytics', icon: BarChart3Icon },
  { path: '/vendor/shop/security', label: 'Security', icon: ShieldIcon },
  { path: '/vendor/shop/danger', label: 'Danger Zone', icon: TriangleAlertIcon },
]

export const SHOP_DEFAULT_PATH = '/vendor/shop/overview'
