import { useState, useEffect } from 'react'
import {
  BellIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  ChevronDownIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
  StoreIcon,
  MenuIcon,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
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
  const { toggleSidebar, setMobileNavOpen } = useDashboard()
  const { theme, setTheme } = useTheme()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 0)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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

      <Button
        variant="ghost"
        size="sm"
        className="hidden gap-2 text-muted-foreground sm:inline-flex"
        onClick={() => {}}
      >
        <SearchIcon className="size-4" />
        <span className="text-sm">Search...</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60 lg:inline-flex">
          &#8984;K
        </kbd>
      </Button>

      <div className="flex-1" />

      <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notifications">
        <BellIcon className="size-4" />
        <Badge
          variant="destructive"
          className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full p-0 text-[9px] font-bold leading-none"
        >
          3
        </Badge>
      </Button>

      <Button size="sm" className="hidden gap-1.5 sm:inline-flex">
        <PlusIcon className="size-4" />
        Add Product
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="hidden gap-1.5 md:inline-flex">
            <StoreIcon className="size-3.5" />
            <span className="text-sm">My Shop</span>
            <ChevronDownIcon className="size-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Shops</DropdownMenuLabel>
          <DropdownMenuItem className="flex items-center gap-2">
            <StoreIcon className="size-4" />
            <span>My Shop</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <UserIcon className="mr-2 size-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem>
            <SettingsIcon className="mr-2 size-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive">
            <LogOutIcon className="mr-2 size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
