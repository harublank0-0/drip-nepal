import RootLayout from '~/layouts/root_layout'
import { ShopDashboardLayout } from '~/layouts/shop_dashboard_layout'

export default function ShopDashboardPage() {
  return <h1>hello</h1>
}

ShopDashboardPage.layout = [RootLayout, ShopDashboardLayout]
