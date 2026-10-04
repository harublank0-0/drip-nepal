import RootLayout from '~/layouts/root_layout'
import { useShopManagementContext } from '../../shop_management_provider'
import { ShopManagementLayout } from '../../layout'
import { ShopOverviewCard } from '../../_components/shop_overview_card'
import { AnalyticsSummary } from '../../_components/analytics_summary'
import { PerformanceInsights } from '../../_components/performance_insights'
import { QuickActions } from './quick_actions'

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
