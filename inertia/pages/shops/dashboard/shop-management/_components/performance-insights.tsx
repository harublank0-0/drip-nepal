import { toast } from 'sonner'
import { SparklesIcon } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { SectionCard } from '../components/section-card'
import type { InsightPriorityLevel, PerformanceInsight } from '../types'

const priorityStyles: Record<InsightPriorityLevel, string> = {
  high: 'bg-destructive/10 text-destructive',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  low: 'bg-muted text-muted-foreground',
}

const priorityLabels: Record<InsightPriorityLevel, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
}

export function PerformanceInsights({ insights }: { insights: PerformanceInsight[] }) {
  return (
    <SectionCard
      icon={SparklesIcon}
      title="Performance Insights"
      description="Actionable opportunities to improve conversion and customer experience."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {insights.map((insight) => (
          <div key={insight.id} className="flex flex-col gap-2.5 rounded-lg border p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{insight.issue}</p>
              <Badge className={cn('shrink-0', priorityStyles[insight.priority])}>
                {priorityLabels[insight.priority]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{insight.description}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-auto w-fit"
              onClick={() => toast.info(`Opening: ${insight.actionLabel}`)}
            >
              {insight.actionLabel}
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
