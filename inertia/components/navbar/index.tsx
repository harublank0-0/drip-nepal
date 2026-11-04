import { useState, useEffect } from 'react'
import { router as inertiaRouter, usePage } from '@inertiajs/react'
import { useRouter } from '@adonisjs/inertia/react'
import {
  LucideSearch,
  LucideShoppingBag,
  LucideUser,
  LucideMenu,
  LucideX,
  LucideLogOut,
  LucideShieldCheck,
  LucideUserCircle,
  LucideArrowRight,
  LucideStore,
  LucidePackage,
  LucideRotateCcw,
  LucideMessageCircle,
  type LucideIcon,
} from 'lucide-react'
import { NavLink } from './nav_link'
import { Link } from '@adonisjs/inertia/react'
import { cn } from '~/lib/utils'
import { routes } from '@generated/registry'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog'
import { VisuallyHidden } from 'radix-ui'
import { motion, AnimatePresence } from 'framer-motion'
import { SearchModal } from '~/components/search/search_modal'
import type { Data } from '@generated/data'
import { Show } from '~/components/ui/show'
import { Typography } from '~/components/ui/typography'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'

const mobileMenuItemClass =
  'flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white'

function MobileMenuLink({
  route,
  icon: Icon,
  children,
}: {
  route: keyof typeof routes
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <Link route={route} className={mobileMenuItemClass}>
      <Icon className="size-4 text-white/50" aria-hidden="true" />
      {children}
    </Link>
  )
}

export const NavBar = () => {
  const {
    url,
    props: { user, shops, cartCount, isAdmin, shopRegistrationOpen, support },
  } = usePage<Data.SharedProps>()
  const isHomePage = routes.home.pattern === url
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const router = useRouter()

  const itemCount = cartCount
  const cartLabel = `Shopping bag${itemCount > 0 ? `, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : ''}`

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80)
    if (isHomePage) {
      window.addEventListener('scroll', handleScroll, { passive: true })
      handleScroll()
    }
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isHomePage])

  // The navbar lives in a persistent layout, so close its menus when
  // another page loads.
  useEffect(
    () =>
      inertiaRouter.on('navigate', () => {
        setMobileMenuOpen(false)
        setProfileOpen(false)
      }),
    []
  )

  // Keep the page behind the open phone menu from scrolling.
  useEffect(() => {
    if (!mobileMenuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchModalOpen(true)
      }
      if (e.key === 'Escape') {
        setProfileOpen(false)
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleLogout = () => {
    router.visit(
      {
        route: 'api.auth.logout',
      },
      {
        method: 'post',
      }
    )
  }

  const handleSearchOpen = () => setSearchModalOpen(true)

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
          isHomePage
            ? cn(
                'backdrop-blur-xl',
                scrolled
                  ? 'bg-black/80 border-b border-white/10 shadow-lg shadow-black/20'
                  : 'bg-transparent'
              )
            : 'bg-black border-b border-white/10'
        )}
      >
        <nav
          aria-label="Main navigation"
          className="flex justify-between items-center pl-5 pr-2 md:px-8 py-3 md:py-4"
        >
          <Link route="home" aria-label="Drip Nepal home">
            <div className="uppercase text-3xl md:text-4xl font-bold tracking-tight">
              <span className="text-white">drip</span>
              <span className="text-primary">nepal</span>
            </div>
          </Link>

          <ul className="hidden md:flex gap-6 text-white/80 text-sm font-medium tracking-wide">
            <li>
              <NavLink route="men">Men</NavLink>
            </li>
            <li>
              <NavLink route="women">Women</NavLink>
            </li>
            <li>
              <NavLink route="search">Shop all</NavLink>
            </li>
          </ul>

          <ul className="flex items-center gap-1 md:gap-6 text-white/80">
            {/* Search */}
            <li>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open search"
                onClick={handleSearchOpen}
                className="cursor-pointer size-11 md:size-8"
              >
                <LucideSearch className="size-5" />
              </Button>
            </li>

            {/* Cart: guests have one too */}
            <li>
              <Button variant="ghost" size="icon-sm" className="relative size-11 md:size-8" asChild>
                <Link route="cart.show" aria-label={cartLabel}>
                  <LucideShoppingBag className="size-5" aria-hidden="true" />
                  {itemCount > 0 && (
                    <span
                      className="absolute top-1 right-1 md:-top-1 md:-right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                      aria-hidden="true"
                    >
                      {itemCount > 9 ? '9+' : itemCount}
                    </span>
                  )}
                </Link>
              </Button>
            </li>

            {/* Profile */}
            <li className="relative hidden sm:block">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={profileOpen ? 'Close user menu' : 'User account'}
                onClick={() => setProfileOpen(!profileOpen)}
                className={cn('cursor-pointer', profileOpen && 'bg-white/10')}
              >
                {user?.initials ? (
                  <span className="size-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {user.initials}
                  </span>
                ) : (
                  <LucideUser className="size-5" />
                )}
              </Button>

              {profileOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
              )}
              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-black/95 backdrop-blur-xl border border-white/10 shadow-xl shadow-black/40 overflow-hidden z-50"
                  >
                    {user ? (
                      <>
                        <div className="px-4 py-3 border-b border-white/10">
                          <p className="text-sm font-medium text-white truncate">{user.fullName}</p>
                          <p className="text-xs text-white/50 truncate mt-0.5">{user.email}</p>
                        </div>
                        <div className="py-1">
                          <Link
                            route="account.orders.index"
                            onClick={() => setProfileOpen(false)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                          >
                            <LucidePackage className="size-4" />
                            My orders
                          </Link>
                          <Show when={isAdmin}>
                            <Link
                              route="admin.shops.index"
                              onClick={() => setProfileOpen(false)}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                            >
                              <LucideShieldCheck className="size-4" />
                              Admin
                            </Link>
                          </Show>

                          <Show when={shops.length > 0}>
                            <Typography.Strong className="px-4 py-2.5 text-xs text-white/50 flex gap-2">
                              <LucideStore className="size-4" />
                              Shops
                            </Typography.Strong>
                            {shops.map((shop) => (
                              <Link
                                key={shop.id}
                                route="ui.shops.shop_dashboard.create"
                                routeParams={{
                                  shopSlug: shop.slug,
                                }}
                                className="capitalize w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                              >
                                <Avatar>
                                  <AvatarImage src={shop.logo ?? undefined} alt={shop.name} />
                                  <AvatarFallback>
                                    <LucideStore className="size-4" />
                                  </AvatarFallback>
                                </Avatar>
                                {shop.name}
                              </Link>
                            ))}
                          </Show>
                        </div>
                        <div className="border-t border-white/10 py-1">
                          <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors"
                          >
                            <LucideLogOut className="size-4" />
                            Logout
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="py-2">
                        <Link
                          route="ui.auth.user_session.create"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                          onClick={() => setProfileOpen(false)}
                        >
                          <LucideArrowRight className="size-4" />
                          Sign In
                        </Link>
                        <Link
                          route="ui.auth.user_registration.create"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                          onClick={() => setProfileOpen(false)}
                        >
                          <LucideUserCircle className="size-4" />
                          Create Account
                        </Link>
                        <Show when={shopRegistrationOpen}>
                          <Link
                            route="ui.auth.shop.shop_registration.create"
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors border-t border-white/10 mt-1 pt-3"
                            onClick={() => setProfileOpen(false)}
                          >
                            <LucideStore className="size-4" />
                            Sell on Drip Nepal
                          </Link>
                        </Show>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
            {/* Mobile menu toggle */}
            <li className="md:hidden">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="cursor-pointer size-11"
              >
                {mobileMenuOpen ? (
                  <LucideX className="size-5" />
                ) : (
                  <LucideMenu className="size-5" />
                )}
              </Button>
            </li>
          </ul>
        </nav>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              id="mobile-menu"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="md:hidden h-[calc(100dvh-4.25rem)] overflow-y-auto overscroll-contain border-t border-white/10 bg-black"
            >
              <nav aria-label="Shop" className="px-5 pt-4 pb-2">
                <ul className="divide-y divide-white/10">
                  {(
                    [
                      ['men', 'Men'],
                      ['women', 'Women'],
                      ['search', 'Shop all'],
                    ] as const
                  ).map(([route, label]) => (
                    <li key={route}>
                      <Link
                        route={route}
                        className="flex min-h-14 items-center justify-between font-heading text-2xl font-bold text-white"
                      >
                        {label}
                        <LucideArrowRight className="size-5 text-white/40" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="mx-5 mt-2 rounded-2xl bg-white/5 p-2">
                {user ? (
                  <>
                    <div className="flex items-center gap-3 px-3 py-3">
                      <span className="size-9 shrink-0 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                        {user.initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
                        <p className="truncate text-xs text-white/50">{user.email}</p>
                      </div>
                    </div>
                    <MobileMenuLink route="account.orders.index" icon={LucidePackage}>
                      My orders
                    </MobileMenuLink>
                    <MobileMenuLink route="cart.show" icon={LucideShoppingBag}>
                      Cart{itemCount > 0 ? ` (${itemCount})` : ''}
                    </MobileMenuLink>
                    {shops.map((shop) => (
                      <Link
                        key={shop.id}
                        route="ui.shops.shop_dashboard.create"
                        routeParams={{ shopSlug: shop.slug }}
                        className={mobileMenuItemClass}
                      >
                        <LucideStore className="size-4 text-white/50" aria-hidden="true" />
                        <span className="truncate">{shop.name} dashboard</span>
                      </Link>
                    ))}
                    <Show when={isAdmin}>
                      <MobileMenuLink route="admin.shops.index" icon={LucideShieldCheck}>
                        Admin
                      </MobileMenuLink>
                    </Show>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false)
                        handleLogout()
                      }}
                      className={cn(mobileMenuItemClass, 'w-full text-red-400')}
                    >
                      <LucideLogOut className="size-4" aria-hidden="true" />
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <MobileMenuLink route="cart.show" icon={LucideShoppingBag}>
                      Cart{itemCount > 0 ? ` (${itemCount})` : ''}
                    </MobileMenuLink>
                    <div className="grid grid-cols-2 gap-2 p-1">
                      <Button asChild className="h-11 rounded-xl">
                        <Link route="ui.auth.user_session.create">Log in</Link>
                      </Button>
                      <Button asChild variant="outline" className="h-11 rounded-xl">
                        <Link route="ui.auth.user_registration.create">Create account</Link>
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <nav aria-label="Help" className="mx-5 mt-4 mb-8">
                <MobileMenuLink route="orders.track" icon={LucideSearch}>
                  Track order
                </MobileMenuLink>
                <MobileMenuLink route="legal.returns" icon={LucideRotateCcw}>
                  Returns and refunds
                </MobileMenuLink>
                {support.whatsapp && (
                  <a
                    href={support.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={mobileMenuItemClass}
                  >
                    <LucideMessageCircle className="size-4 text-white/50" aria-hidden="true" />
                    WhatsApp us
                  </a>
                )}
                <Show when={shopRegistrationOpen}>
                  <MobileMenuLink route="ui.auth.shop.shop_registration.create" icon={LucideStore}>
                    Sell on Drip Nepal
                  </MobileMenuLink>
                </Show>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Search Modal */}
      <Dialog open={searchModalOpen} onOpenChange={setSearchModalOpen}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-2xl w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-h-[85vh] overflow-hidden p-0 shadow-2xl gap-0 top-[15%] sm:top-[20%] translate-y-0"
        >
          <VisuallyHidden.VisuallyHidden asChild>
            <DialogTitle>Search</DialogTitle>
          </VisuallyHidden.VisuallyHidden>
          <SearchModal open={searchModalOpen} onOpenChange={setSearchModalOpen} />
        </DialogContent>
      </Dialog>
    </>
  )
}
