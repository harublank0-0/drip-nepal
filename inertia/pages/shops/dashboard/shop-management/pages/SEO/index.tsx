import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop-management-provider'
import { ShopManagementLayout } from '../../layout'
import { SeoSettings } from '../../_components/seo-settings'

export default function SEOPage() {
  const { draft, setSection } = useShopManagementContext()

  return (
    <SeoSettings
      value={draft.seo}
      onChange={(next) => setSection('seo', next)}
      storeSlug={draft.information.storeSlug}
    />
  )
}

SEOPage.layout = [RootLayout, ShopManagementLayout]
