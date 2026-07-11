import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop-management-provider'
import { ShopManagementLayout } from '../../layout'
import { SecuritySettings } from '../../_components/security-settings'

export default function SecurityPage() {
  const { draft, setSection } = useShopManagementContext()

  return (
    <SecuritySettings value={draft.security} onChange={(next) => setSection('security', next)} />
  )
}

SecurityPage.layout = [RootLayout, ShopManagementLayout]
