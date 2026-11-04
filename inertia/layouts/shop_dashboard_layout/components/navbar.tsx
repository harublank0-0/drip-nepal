import { useState, useEffect } from 'react'
import { usePage } from '@inertiajs/react'
import { Link, useRouter } from '@adonisjs/inertia/react'
import {
  PlusIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  ChevronDownIcon,
  LogOutIcon,
  StoreIcon,
  MenuIcon,
  HomeIcon,
  CheckIcon,
  BellIcon,
  BellRingIcon,
} from 'lucide-react'
import type { Data } from '@generated/data'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { useDashboard } from './dashboard_context'
import { useTheme } from '~/components/providers/theme_provider'

export function Navbar() {
  const { toggleSidebar, setMobileNavOpen, orderAlerts } = useDashboard()
  const { pending, alertsOn, notificationsAllowed, enableAlerts, disableAlerts } = orderAlerts
  const { theme, setTheme } = useTheme()
  const [scrolled, setScrolled] = useState(false)
  const { user, shops, currentShop } = usePage<Data.SharedProps>().props
  const router = useRouter()

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 0)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const logout = () => {
    router.visit({ route: 'api.auth.logout' }, { method: 'post' })
  }

  return (
    <header
      data-slot="navbar"
      className={cn(
        'sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-sm transition-colors sm:px-6',
        scrolled && 'bg-background/95 shadow-xs'
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="flex lg:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation menu"
      >
        <MenuIcon />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="hidden lg:flex"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
      >
        <MenuIcon />
      </Button>

      <div className="flex-1" />

      {currentShop && (
        <Button size="sm" className="hidden gap-1.5 sm:inline-flex" asChild>
          <Link href={`/shops/${currentShop.slug}/products/create`}>
            <PlusIcon className="size-4" />
            Add Product
          </Link>
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="hidden gap-1.5 md:inline-flex">
            <StoreIcon className="size-3.5" />
            <span className="max-w-40 truncate text-sm">{currentShop?.name ?? 'My Shop'}</span>
            <ChevronDownIcon className="size-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Your shops</DropdownMenuLabel>
          {shops.map((shop) => (
            <DropdownMenuItem key={shop.id} asChild>
              <Link href={`/shops/${shop.slug}/dashboard`} className="flex items-center gap-2">
                <StoreIcon className="size-4" />
                <span className="flex-1 truncate">{shop.name}</span>
                {shop.id === currentShop?.id && <CheckIcon className="size-4" />}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {currentShop && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative"
              aria-label={
                pending ? `Order alerts: ${pending} waiting to be confirmed` : 'Order alerts'
              }
            >
              {alertsOn ? <BellRingIcon className="size-4" /> : <BellIcon className="size-4" />}
              {pending ? (
                <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">
                  {pending}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              {pending
                ? `${pending} order${pending === 1 ? '' : 's'} waiting to be confirmed`
                : 'No orders waiting'}
            </DropdownMenuLabel>
            {pending ? (
              <DropdownMenuItem asChild>
                <Link href={`/shops/${currentShop.slug}/orders?status=pending`}>
                  See orders to confirm
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => (alertsOn ? disableAlerts() : void enableAlerts())}>
              {alertsOn ? 'Turn off sound and desktop alerts' : 'Turn on sound and desktop alerts'}
            </DropdownMenuItem>
            {alertsOn && !notificationsAllowed ? (
              <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                This browser blocks desktop notifications for this site, so alerts are sound only.
              </p>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Toggle theme">
            {theme === 'dark' ? (
              <MoonIcon className="size-4" />
            ) : theme === 'light' ? (
              <SunIcon className="size-4" />
            ) : (
              <MonitorIcon className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setTheme('light')}>
            <SunIcon className="mr-2 size-4" />
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('dark')}>
            <MoonIcon className="mr-2 size-4" />
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('system')}>
            <MonitorIcon className="mr-2 size-4" />
            System
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="User menu">
            <Avatar size="sm">
              <AvatarFallback>{user?.initials ?? 'U'}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">
            {user?.fullName ?? 'My Account'}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/" className="flex items-center">
              <HomeIcon className="mr-2 size-4" />
              Back to Drip Nepal
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={logout}>
            <LogOutIcon className="mr-2 size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
