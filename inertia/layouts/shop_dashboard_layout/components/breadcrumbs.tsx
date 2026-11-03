import { usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { ChevronRightIcon, HomeIcon } from 'lucide-react'
import { cn } from '~/lib/utils'
import { findNavItemByPath, useDashboardNav } from './navigation'
import { useDashboard } from './dashboard_context'
import type { BreadcrumbItem, NavSection } from './types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function humanizeSegment(segment: string): string {
  return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/*
 * Builds "Dashboard > Products > Create" from the URL. Ids are skipped so
 * an edit page reads "Products > Edit".
 */
function generateBreadcrumbs(url: string, nav: NavSection[]): BreadcrumbItem[] {
  const match = url.split('?')[0].match(/^(\/shops\/[^/]+)(\/.*)?$/)
  if (!match) return []

  const base = match[1]
  const dashboardPath = `${base}/dashboard`
  const crumbs: BreadcrumbItem[] = [{ label: 'Dashboard', href: dashboardPath }]

  let accumulated = base
  for (const segment of (match[2] ?? '').split('/').filter(Boolean)) {
    accumulated += '/' + segment
    if (accumulated === dashboardPath || UUID_PATTERN.test(segment)) continue

    const navMatch = findNavItemByPath(nav, accumulated)
    crumbs.push(
      navMatch
        ? { label: navMatch.item.label, href: accumulated }
        : { label: humanizeSegment(segment) }
    )
  }

  return crumbs
}

export function Breadcrumbs() {
  const { url } = usePage()
  const nav = useDashboardNav()
  const { breadcrumbs: manualBreadcrumbs } = useDashboard()

  const items = manualBreadcrumbs.length > 0 ? manualBreadcrumbs : generateBreadcrumbs(url, nav)

  if (items.length <= 1) return null

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={index} className="flex items-center gap-1.5">
              {index === 0 && <HomeIcon className="size-3.5" />}
              {index > 0 && (
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
              )}
              {item.href && !isLast ? (
                <Link href={item.href} className="transition-colors hover:text-foreground">
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(isLast && 'font-medium text-foreground')}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
