import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop_management_provider'
import { ShopManagementLayout } from '../../layout'
import { AnalyticsSummary } from '../../_components/analytics_summary'
import { PerformanceInsights } from '../../_components/performance_insights'

export default function AnalyticsPage() {
  const { draft } = useShopManagementContext()

  return (
    <>
      <AnalyticsSummary metrics={draft.analytics} />
      <PerformanceInsights insights={draft.insights} />
    </>
  )
}

AnalyticsPage.layout = [RootLayout, ShopManagementLayout]
