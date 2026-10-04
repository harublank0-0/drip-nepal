import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop_management_provider'
import { ShopManagementLayout } from '../../layout'
import { PoliciesSection } from '../../_components/policies_section'

export default function PoliciesPage() {
  const { draft, setSection } = useShopManagementContext()

  return (
    <PoliciesSection value={draft.policies} onChange={(next) => setSection('policies', next)} />
  )
}

PoliciesPage.layout = [RootLayout, ShopManagementLayout]
