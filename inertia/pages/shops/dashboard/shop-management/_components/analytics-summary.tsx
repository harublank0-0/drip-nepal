import { BarChart3Icon } from 'lucide-react'
import { SectionCard } from '../components/section-card'
import { StatCard } from '../components/stat-card'
import type { AnalyticsMetric } from '../types'

export function AnalyticsSummary({ metrics }: { metrics: AnalyticsMetric[] }) {
  return (
    <SectionCard
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
