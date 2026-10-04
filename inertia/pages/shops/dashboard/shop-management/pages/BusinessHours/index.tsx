import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop_management_provider'
import { ShopManagementLayout } from '../../layout'
import { BusinessHours } from '../../_components/business_hours'

export default function BusinessHoursPage() {
  const { draft, setSection } = useShopManagementContext()

  return (
    <BusinessHours
      value={draft.businessHours}
      onChange={(next) => setSection('businessHours', next)}
    />
  )
}

BusinessHoursPage.layout = [RootLayout, ShopManagementLayout]
