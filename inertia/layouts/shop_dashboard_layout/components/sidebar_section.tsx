import { usePage } from '@inertiajs/react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '~/lib/utils'
import { SidebarItem } from './sidebar_item'
import type { NavSection } from './types'

function isActivePath(path: string | undefined, url: string): boolean {
  if (!path) return false
  if (url === path) return true
  if (url.startsWith(path) && url[path.length] === '/') return true
  return false
}

interface SidebarSectionProps {
  section: NavSection
  collapsed: boolean
  isExpanded: boolean
  onToggle: () => void
}

export function SidebarSection({ section, collapsed, isExpanded, onToggle }: SidebarSectionProps) {
  const { url } = usePage()

  const sectionHasActiveChild = section.children.some((item) => isActivePath(item.path, url))
  const shouldShowChildren = isExpanded || sectionHasActiveChild

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {section.children.map((item) => (
          <SidebarItem
            key={item.id}
            item={item}
            collapsed={true}
            isActive={isActivePath(item.path, url)}
          />
        ))}
      </div>
    )
  }

  return (
    <div data-slot="sidebar-section">
      <button
        onClick={onToggle}
        data-active={sectionHasActiveChild}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
          sectionHasActiveChild
            ? 'text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/50 hover:text-sidebar-foreground/80'
        )}
      >
        <ChevronDownIcon
          className={cn(
            'size-3 shrink-0 transition-transform duration-150',
            shouldShowChildren ? 'rotate-0' : '-rotate-90'
          )}
        />
        <section.icon className="size-3.5 shrink-0" />
        <span className="truncate">{section.label}</span>
      </button>
      {shouldShowChildren && (
        <div className="mt-0.5 space-y-0.5">
          {section.children.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              collapsed={false}
              isActive={isActivePath(item.path, url)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
