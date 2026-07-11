import { Link } from '@inertiajs/react'
import { cn } from '~/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { Badge } from '~/components/ui/badge'
import type { NavItem } from './types'

interface SidebarItemProps {
  item: NavItem
  collapsed: boolean
  isActive: boolean
}

export function SidebarItem({ item, collapsed, isActive }: SidebarItemProps) {
  const link = (
    <Link
      href={item.path ?? '#'}
      data-slot="sidebar-item"
      data-active={isActive}
      className={cn(
        'relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-all outline-none',
        'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        collapsed && 'justify-center px-0'
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <item.icon className="size-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge != null && (
            <Badge
              variant="secondary"
              className="ml-auto flex size-5 items-center justify-center rounded-full p-0 text-[10px] font-medium leading-none"
            >
              {item.badge}
            </Badge>
          )}
        </>
      )}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="text-xs">
          {item.label}
          {item.badge != null && ` (${item.badge})`}
        </TooltipContent>
      </Tooltip>
    )
  }

  return link
}
