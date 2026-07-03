import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop-management-provider'
import { ShopManagementLayout } from '../../layout'
import { AnalyticsSummary } from '../../_components/analytics-summary'
import { PerformanceInsights } from '../../_components/performance-insights'

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
