import { motion } from 'framer-motion'
import { cn } from '~/lib/utils'

type SparklineProps = {
  data: number[]
  positive?: boolean
  className?: string
  height?: number
}

export function Sparkline({ data, positive = true, className, height = 36 }: SparklineProps) {
  if (data.length < 2) return null

  const width = 100
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - ((value - min) / range) * (height - 4) - 2
    return [x, y] as const
  })

  const linePath = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`

  const strokeColor = positive ? 'var(--color-chart-2)' : 'var(--color-destructive)'

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-9 w-full overflow-visible', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`sparkline-fill-${positive ? 'up' : 'down'}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <motion.path
        d={areaPath}
        fill={`url(#sparkline-fill-${positive ? 'up' : 'down'})`}
        stroke="none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      />
      <motion.path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </svg>
  )
}
