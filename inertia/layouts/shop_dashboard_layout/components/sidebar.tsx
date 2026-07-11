import { useState } from 'react'
import { cn } from '~/lib/utils'
import { SidebarSection } from './sidebar_section'
import { DASHBOARD_NAV } from './navigation'
import { useDashboard } from './dashboard_context'

export function Sidebar() {
  const { sidebarCollapsed } = useDashboard()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['dashboard']))

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  return (
    <aside
      data-slot="sidebar"
      data-collapsed={sidebarCollapsed}
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 ease-in-out lg:flex',
        sidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-sidebar-border',
          sidebarCollapsed ? 'justify-center' : 'gap-2.5 px-4'
        )}
      >
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
          <span className="text-sm font-bold text-primary-foreground">D</span>
        </div>
        {!sidebarCollapsed && (
          <span className="truncate text-sm font-semibold text-sidebar-foreground">Drip Nepal</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <nav className="space-y-1">
          {DASHBOARD_NAV.map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              collapsed={sidebarCollapsed}
              isExpanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </nav>
      </div>
    </aside>
  )
}
