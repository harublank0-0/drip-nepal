import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop-management-provider'
import { ShopManagementLayout } from '../../layout'
import { ShopInformationForm } from '../../_components/shop-information-form'

export default function GeneralPage() {
  const { draft, setSection } = useShopManagementContext()

  return (
    <ShopInformationForm
      value={draft.information}
      onChange={(next) => setSection('information', next)}
    />
  )
}

GeneralPage.layout = [RootLayout, ShopManagementLayout]
