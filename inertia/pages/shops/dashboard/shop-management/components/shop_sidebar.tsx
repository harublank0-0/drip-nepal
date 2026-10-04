import { usePage } from '@inertiajs/react'
import { cn } from '~/lib/utils'
import { SHOP_NAV_ITEMS } from '../routes'

export function ShopSidebar() {
  const { url } = usePage()

  return (
    <nav
      aria-label="Shop management sections"
      className="sticky top-24 hidden max-h-[calc(100vh-7rem)] w-56 shrink-0 flex-col gap-0.5 overflow-y-auto pb-8 lg:flex"
    >
      {SHOP_NAV_ITEMS.map((item) => {
        const isActive = url === item.path
        return (
          <a
            key={item.path}
            href={item.path}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              isActive &&
                'bg-primary/10 font-medium text-primary hover:bg-primary/10 hover:text-primary'
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </a>
        )
      })}
    </nav>
  )
}

export function MobileShopNav() {
  const { url } = usePage()

  return (
    <nav
      aria-label="Shop management sections"
      className="sticky top-0 z-30 flex gap-1 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur-sm lg:hidden"
    >
      {SHOP_NAV_ITEMS.map((item) => {
        const isActive = url === item.path
        return (
          <a
            key={item.path}
            href={item.path}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors',
              isActive && 'border-primary/30 bg-primary/10 text-primary'
            )}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </a>
        )
      })}
    </nav>
  )
}
