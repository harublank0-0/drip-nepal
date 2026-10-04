import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop_management_provider'
import { ShopManagementLayout } from '../../layout'
import { DangerZone } from '../../_components/danger_zone'

export default function DangerZonePage() {
  const { draft } = useShopManagementContext()

  return <DangerZone storeName={draft.information.storeName} />
}

DangerZonePage.layout = [RootLayout, ShopManagementLayout]
