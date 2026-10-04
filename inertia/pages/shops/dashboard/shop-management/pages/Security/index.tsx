import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop_management_provider'
import { ShopManagementLayout } from '../../layout'
import { SecuritySettings } from '../../_components/security_settings'

export default function SecurityPage() {
  const { draft, setSection } = useShopManagementContext()

  return (
    <SecuritySettings value={draft.security} onChange={(next) => setSection('security', next)} />
  )
}

SecurityPage.layout = [RootLayout, ShopManagementLayout]
