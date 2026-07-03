import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop-management-provider'
import { ShopManagementLayout } from '../../layout'
import { DangerZone } from '../../_components/danger-zone'

export default function DangerZonePage() {
  const { draft } = useShopManagementContext()

  return <DangerZone storeName={draft.information.storeName} />
}

DangerZonePage.layout = [RootLayout, ShopManagementLayout]
