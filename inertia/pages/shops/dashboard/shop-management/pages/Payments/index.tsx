import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop_management_provider'
import { ShopManagementLayout } from '../../layout'
import { PaymentSettings } from '../../_components/payment_settings'

export default function PaymentsPage() {
  const { draft, setSection } = useShopManagementContext()

  return (
    <PaymentSettings value={draft.payments} onChange={(next) => setSection('payments', next)} />
  )
}

PaymentsPage.layout = [RootLayout, ShopManagementLayout]
