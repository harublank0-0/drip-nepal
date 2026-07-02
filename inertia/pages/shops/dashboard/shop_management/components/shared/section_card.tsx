import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader } from '~/components/ui/card'
import { Typography } from '~/components/ui/typography'
import { cn } from '~/lib/utils'
import { Show } from '~/components/ui/show'

type SectionCardProps = React.PropsWithChildren<{
  id?: string
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  contentClassName?: string
  noPadding?: boolean
}>

export function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  action,
  className,
  contentClassName,
  noPadding,
  children,
}: SectionCardProps) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="scroll-mt-24"
    >
      <Card
        className={cn(
          'transition-shadow duration-200 hover:shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.12)]',
          className
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-start gap-3">
            <Show when={!!Icon}>
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {Icon ? <Icon className="size-4" /> : null}
              </span>
            </Show>
            <div className="space-y-1">
              <Typography.H4 className="text-base font-heading font-medium tracking-tight">
                {title}
              </Typography.H4>
              <Show when={!!description}>
                <Typography.Muted className="text-sm leading-snug">{description}</Typography.Muted>
              </Show>
            </div>
          </div>
          <Show when={!!action}>
            <div className="shrink-0">{action}</div>
          </Show>
        </CardHeader>
        <CardContent className={cn(noPadding && 'px-0', contentClassName)}>{children}</CardContent>
      </Card>
    </motion.div>
  )
}
