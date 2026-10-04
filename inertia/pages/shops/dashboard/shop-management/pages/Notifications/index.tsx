import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop_management_provider'
import { ShopManagementLayout } from '../../layout'
import { NotificationSettings } from '../../_components/notification_settings'

export default function NotificationsPage() {
  const { draft, setSection } = useShopManagementContext()

  return (
    <NotificationSettings
      value={draft.notifications}
      onChange={(next) => setSection('notifications', next)}
    />
  )
}

NotificationsPage.layout = [RootLayout, ShopManagementLayout]
