import { useEffect } from 'react'
import { usePage } from '@inertiajs/react'
import { XIcon } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetClose } from '~/components/ui/sheet'
import { VisuallyHidden } from 'radix-ui'
import { Button } from '~/components/ui/button'
import { useDashboard } from './dashboard_context'
import { DASHBOARD_NAV } from './navigation'
import { SidebarItem } from './sidebar_item'

function isActivePath(path: string | undefined, url: string): boolean {
  if (!path) return false
  if (url === path) return true
  if (url.startsWith(path) && url[path.length] === '/') return true
  return false
}

export function MobileNav() {
  const { mobileNavOpen, setMobileNavOpen } = useDashboard()
  const { url } = usePage()

  useEffect(() => {
    setMobileNavOpen(false)
  }, [url, setMobileNavOpen])

  return (
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <SheetContent side="left" className="w-72 p-0">
        <VisuallyHidden.Root>
          <SheetTitle>Navigation</SheetTitle>
        </VisuallyHidden.Root>

        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">D</span>
          </div>
          <span className="text-sm font-semibold">Drip Nepal</span>
          <SheetClose asChild className="ml-auto">
            <Button variant="ghost" size="icon-sm">
              <XIcon className="size-4" />
            </Button>
          </SheetClose>
        </div>

        <nav className="overflow-y-auto p-3">
          {DASHBOARD_NAV.map((section) => (
            <div key={section.id} className="mb-4">
              <div className="mb-1 flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <section.icon className="size-3.5" />
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.children.map((item) => (
                  <SidebarItem
                    key={item.id}
                    item={item}
                    collapsed={false}
                    isActive={isActivePath(item.path, url)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
