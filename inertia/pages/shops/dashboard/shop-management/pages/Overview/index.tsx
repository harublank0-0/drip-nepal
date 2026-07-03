import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop-management-provider'
import { ShopManagementLayout } from '../../layout'
import { ShopOverviewCard } from '../../_components/shop-overview-card'
import { AnalyticsSummary } from '../../_components/analytics-summary'
import { PerformanceInsights } from '../../_components/performance-insights'
import { QuickActions } from './quick-actions'

export default function OverviewPage() {
  const { draft } = useShopManagementContext()

  return (
    <>
      <ShopOverviewCard overview={draft.overview} onEditLogo={() => {}} onEditBanner={() => {}} />
      <AnalyticsSummary metrics={draft.analytics} />
      <PerformanceInsights insights={draft.insights} />
      <QuickActions />
    </>
  )
}

OverviewPage.layout = [RootLayout, ShopManagementLayout]
