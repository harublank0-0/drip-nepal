import { BarChart3Icon } from 'lucide-react'
import { SectionCard } from './shared/section_card'
import { StatCard } from './shared/stat_card'
import type { AnalyticsMetric } from '../types'

export function AnalyticsSummary({ metrics }: { metrics: AnalyticsMetric[] }) {
  return (
    <SectionCard
      id="analytics"
      icon={BarChart3Icon}
      title="Store Analytics"
      description="A quick pulse on how your store is performing right now."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <StatCard key={metric.key} metric={metric} />
        ))}
      </div>
    </SectionCard>
  )
}
