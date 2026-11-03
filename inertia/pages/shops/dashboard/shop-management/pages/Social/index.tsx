import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop_management_provider'
import { ShopManagementLayout } from '../../layout'
import { SocialLinks } from '../../_components/social_links'

export default function SocialPage() {
  const { draft, setSection } = useShopManagementContext()

  return <SocialLinks value={draft.social} onChange={(next) => setSection('social', next)} />
}

SocialPage.layout = [RootLayout, ShopManagementLayout]
