import { ArrowDownRightIcon, ArrowUpRightIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { Sparkline } from './sparkline'
import { cn } from '~/lib/utils'
import type { AnalyticsMetric } from '../types'

export function StatCard({ metric }: { metric: AnalyticsMetric }) {
  const positive = metric.delta >= 0

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col gap-2.5 rounded-lg border bg-card p-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
        <span
          className={cn(
            'flex items-center gap-0.5 text-xs font-medium',
            positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
          )}
        >
          {positive ? (
            <ArrowUpRightIcon className="size-3" />
          ) : (
            <ArrowDownRightIcon className="size-3" />
          )}
          {Math.abs(metric.delta)}%
        </span>
      </div>
      <span className="font-heading text-xl font-semibold tracking-tight">{metric.value}</span>
      <Sparkline data={metric.trend} positive={positive} />
    </motion.div>
  )
}
