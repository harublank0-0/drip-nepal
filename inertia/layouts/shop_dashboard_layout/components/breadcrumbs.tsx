import { usePage } from '@inertiajs/react'
import { ChevronRightIcon, HomeIcon } from 'lucide-react'
import { cn } from '~/lib/utils'
import { findNavItemByPath } from './navigation'
import { useDashboard } from './dashboard_context'
import type { BreadcrumbItem } from './types'

function humanizeSegment(segment: string): string {
  const cleaned = segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  if (/^\d+$/.test(segment)) return `#${segment}`
  return cleaned
}

function generateBreadcrumbs(url: string): BreadcrumbItem[] {
  const segments = url
    .replace(/^\/shop\/?/, '')
    .split('/')
    .filter(Boolean)

  if (segments.length === 0) {
    return [{ label: 'Dashboard', href: '/shop/dashboard' }]
  }

  const crumbs: BreadcrumbItem[] = [{ label: 'Dashboard', href: '/shop/dashboard' }]

  let accumulated = '/shop'
  for (const segment of segments) {
    accumulated += '/' + segment

    const match = findNavItemByPath(accumulated)
    if (match) {
      crumbs.push({ label: match.item.label, href: accumulated })
    } else {
      const parentPath = accumulated.substring(0, accumulated.lastIndexOf('/'))
      const parentMatch = findNavItemByPath(parentPath)
      if (parentMatch && accumulated === parentMatch.item.path + '/' + segment) {
        crumbs.push({ label: humanizeSegment(segment) })
      } else {
        crumbs.push({ label: humanizeSegment(segment) })
      }
    }
  }

  return crumbs
}

export function Breadcrumbs() {
  const { url } = usePage()
  const { breadcrumbs: manualBreadcrumbs } = useDashboard()

  const items = manualBreadcrumbs.length > 0 ? manualBreadcrumbs : generateBreadcrumbs(url)

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
                <a href={item.href} className="transition-colors hover:text-foreground">
                  {item.label}
                </a>
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
