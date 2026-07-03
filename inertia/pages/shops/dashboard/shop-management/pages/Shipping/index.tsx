import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop-management-provider'
import { ShopManagementLayout } from '../../layout'
import { ShippingSettings } from '../../_components/shipping-settings'

export default function ShippingPage() {
  const { draft, setSection } = useShopManagementContext()

  return (
    <ShippingSettings value={draft.shipping} onChange={(next) => setSection('shipping', next)} />
  )
}

ShippingPage.layout = [RootLayout, ShopManagementLayout]
