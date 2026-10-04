import { motion } from 'framer-motion'
import {
  BadgeCheckIcon,
  CalendarIcon,
  ImagePlusIcon,
  PackageIcon,
  StarIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react'
import { Card } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Typography } from '~/components/ui/typography'
import { Separator } from '~/components/ui/separator'
import { cn } from '~/lib/utils'
import { formatCompactNumber, formatCurrency, formatDate } from '../format'
import type { ShopOverview } from '../types'

const statusStyles: Record<ShopOverview['status'], string> = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  draft: 'bg-muted text-muted-foreground',
  suspended: 'bg-destructive/10 text-destructive',
  under_review: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
}

const statusLabels: Record<ShopOverview['status'], string> = {
  active: 'Active',
  draft: 'Draft',
  suspended: 'Suspended',
  under_review: 'Under Review',
}

const planLabels: Record<ShopOverview['plan'], string> = {
  starter: 'Starter',
  growth: 'Growth',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

type ShopOverviewCardProps = {
  overview: ShopOverview
  onEditLogo: () => void
  onEditBanner: () => void
}

export function ShopOverviewCard({ overview, onEditLogo, onEditBanner }: ShopOverviewCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <Card className="overflow-hidden py-0">
        {/* Banner */}
        <div className="relative h-32 w-full bg-gradient-to-br from-primary/25 via-primary/10 to-accent/20 sm:h-40">
          {overview.banner ? (
            <img src={overview.banner} alt="Store banner" className="size-full object-cover" />
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute top-3 right-3 shadow-sm"
            onClick={onEditBanner}
          >
            <ImagePlusIcon data-icon="inline-start" />
            Edit Banner
          </Button>
        </div>

        <div className="px-4 pb-4 sm:px-6">
          {/* Logo + identity row */}
          <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="relative">
                <Avatar
                  size="lg"
                  className="size-20 border-4 border-background shadow-md sm:size-24"
                >
                  <AvatarImage src={overview.logo ?? undefined} alt={overview.name} />
                  <AvatarFallback className="text-2xl font-heading">
                    {overview.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="absolute -right-1 -bottom-1 rounded-full shadow-sm"
                  onClick={onEditLogo}
                  aria-label="Edit logo"
                >
                  <ImagePlusIcon />
                </Button>
              </div>

              <div className="space-y-1 pb-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Typography.H3 className="text-lg font-heading font-semibold tracking-tight sm:text-xl">
                    {overview.name}
                  </Typography.H3>
                  {overview.isVerified ? (
                    <BadgeCheckIcon className="size-4 text-primary" aria-label="Verified store" />
                  ) : null}
                </div>
                <a
                  href={`/${overview.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  drip-nepal.com/{overview.slug}
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pb-1">
              <Badge className={cn(statusStyles[overview.status])}>
                {statusLabels[overview.status]}
              </Badge>
              <Badge variant="outline">{planLabels[overview.plan]} Plan</Badge>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Stat strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <OverviewStat
              icon={StarIcon}
              label="Rating"
              value={overview.rating.toFixed(1)}
              hint={`${formatCompactNumber(overview.reviewCount)} reviews`}
            />
            <OverviewStat
              icon={PackageIcon}
              label="Products"
              value={formatCompactNumber(overview.totalProducts)}
            />
            <OverviewStat
              icon={UsersIcon}
              label="Followers"
              value={formatCompactNumber(overview.followers)}
            />
            <OverviewStat
              icon={WalletIcon}
              label="Total Sales"
              value={formatCurrency(overview.totalSales)}
            />
            <OverviewStat
              icon={CalendarIcon}
              label="Joined"
              value={formatDate(overview.joinedAt)}
            />
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

function OverviewStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">{value}</span>
        <span className="truncate text-xs text-muted-foreground">
          {label}
          {hint ? ` · ${hint}` : ''}
        </span>
      </div>
    </div>
  )
}
