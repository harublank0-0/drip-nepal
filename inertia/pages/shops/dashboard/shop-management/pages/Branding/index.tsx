import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop_management_provider'
import { ShopManagementLayout } from '../../layout'
import { BrandingSettings } from '../../_components/branding_settings'

export default function BrandingPage() {
  const { draft, setSection } = useShopManagementContext()

  return (
    <BrandingSettings value={draft.branding} onChange={(next) => setSection('branding', next)} />
  )
}

BrandingPage.layout = [RootLayout, ShopManagementLayout]
