import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop-management-provider'
import { ShopManagementLayout } from '../../layout'
import { SocialLinks } from '../../_components/social-links'

export default function SocialPage() {
  const { draft, setSection } = useShopManagementContext()

  return <SocialLinks value={draft.social} onChange={(next) => setSection('social', next)} />
}

SocialPage.layout = [RootLayout, ShopManagementLayout]
