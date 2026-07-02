import { useEffect, useState } from 'react'
import {
  BarChart3Icon,
  BellIcon,
  BuildingIcon,
  ClockIcon,
  CreditCardIcon,
  PaletteIcon,
  ScrollTextIcon,
  SearchIcon,
  Share2Icon,
  ShieldIcon,
  SparklesIcon,
  StoreIcon,
  TriangleAlertIcon,
  TruckIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '~/lib/utils'
import type { SectionId } from '../types'

const navItems: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: StoreIcon },
  { id: 'information', label: 'Shop Information', icon: BuildingIcon },
  { id: 'branding', label: 'Branding', icon: PaletteIcon },
  { id: 'hours', label: 'Business Hours', icon: ClockIcon },
  { id: 'shipping', label: 'Shipping', icon: TruckIcon },
  { id: 'payments', label: 'Payments', icon: CreditCardIcon },
  { id: 'notifications', label: 'Notifications', icon: BellIcon },
  { id: 'policies', label: 'Policies', icon: ScrollTextIcon },
  { id: 'seo', label: 'SEO', icon: SearchIcon },
  { id: 'social', label: 'Social Media', icon: Share2Icon },
  { id: 'analytics', label: 'Analytics', icon: BarChart3Icon },
  { id: 'insights', label: 'Insights', icon: SparklesIcon },
  { id: 'security', label: 'Security', icon: ShieldIcon },
  { id: 'danger', label: 'Danger Zone', icon: TriangleAlertIcon },
]

function useActiveSection() {
  const [active, setActive] = useState<SectionId>('overview')

  useEffect(() => {
    const elements = navItems
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => !!el)

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]

        if (visible?.target.id) {
          setActive(visible.target.id as SectionId)
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return active
}

function scrollTo(id: SectionId) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Sticky vertical sidebar, rendered inside the desktop content row. */
export function SectionNav() {
  const active = useActiveSection()

  return (
    <nav
      aria-label="Shop management sections"
      className="sticky top-24 hidden max-h-[calc(100vh-7rem)] w-56 shrink-0 flex-col gap-0.5 overflow-y-auto pb-8 lg:flex"
    >
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => scrollTo(item.id)}
          aria-current={active === item.id ? 'true' : undefined}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            active === item.id &&
              'bg-primary/10 font-medium text-primary hover:bg-primary/10 hover:text-primary'
          )}
        >
          <item.icon className="size-4 shrink-0" />
          {item.label}
        </button>
      ))}
    </nav>
  )
}

/** Horizontal scrollable pill nav, rendered full-width above the content row on mobile. */
export function MobileSectionNav() {
  const active = useActiveSection()

  return (
    <nav
      aria-label="Shop management sections"
      className="sticky top-0 z-30 flex gap-1 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur-sm lg:hidden"
    >
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => scrollTo(item.id)}
          aria-current={active === item.id ? 'true' : undefined}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors',
            active === item.id && 'border-primary/30 bg-primary/10 text-primary'
          )}
        >
          <item.icon className="size-3.5" />
          {item.label}
        </button>
      ))}
    </nav>
  )
}
