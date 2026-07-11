import { useState, useEffect } from 'react'
import { usePage } from '@inertiajs/react'
import { useRouter } from '@adonisjs/inertia/react'
import {
  LucideSearch,
  LucideShoppingBag,
  LucideUser,
  LucideMenu,
  LucideX,
  LucideLogOut,
  LucideSettings,
  LucideUserCircle,
  LucideArrowRight,
  LucideStore,
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
import { useCart } from '~/hooks/use_cart'
import { Data } from '@generated/data'
import { Show } from '~/components/ui/show'

type User = {
  fullName: string
  email: string
  initials: string
}
export const NavBar = () => {
  const {
    url,
    props: { user, shops },
  } = usePage<Data.SharedProps>()
  const isHomePage = routes.home.pattern === url
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const router = useRouter()

  const { openDrawer, itemCount } = useCart()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80)
    if (isHomePage) {
      window.addEventListener('scroll', handleScroll, { passive: true })
      handleScroll()
    }
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isHomePage])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchModalOpen(true)
      }
      if (e.key === 'Escape') {
        setProfileOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleLogout = () => {
    router.visit({
      route: 'session.destroy',
    })
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
          className="flex justify-between items-center px-6 md:px-8 py-4"
        >
          <Link route="home" aria-label="Drip Nepal home">
            <div className="uppercase text-3xl md:text-4xl font-bold tracking-tight">
              <span className="text-white">drip</span>
              <span className="text-primary">nepal</span>
            </div>
          </Link>

          <ul className="hidden md:flex gap-6 capitalize text-white/80 text-sm font-medium tracking-wide">
            <li>
              <NavLink route="men">Men</NavLink>
            </li>
            <li>
              <NavLink route="women">Women</NavLink>
            </li>
          </ul>

          <ul className="flex items-center gap-4 md:gap-6 text-white/80">
            {/* Search */}
            <li>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open search"
                onClick={handleSearchOpen}
                className="cursor-pointer"
              >
                <LucideSearch className="size-5" />
              </Button>
            </li>

            {/* Cart */}
            <li className="hidden sm:block">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Shopping bag${itemCount > 0 ? `, ${itemCount} items` : ''}`}
                onClick={openDrawer}
                className="relative cursor-pointer"
              >
                <LucideShoppingBag className="size-5" />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                )}
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
                          <button
                            onClick={() => setProfileOpen(false)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                          >
                            <LucideUserCircle className="size-4" />
                            Profile
                          </button>
                          <button
                            onClick={() => setProfileOpen(false)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                          >
                            <LucideSettings className="size-4" />
                            Settings
                          </button>

                          <Show when={shops.length > 0}>
                            <Link
                              route="shops.dashboard.shop_dashboard.create"
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                            >
                              <LucideStore className="size-4" />
                              View Shops
                            </Link>
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
                          route="session.create"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                          onClick={() => setProfileOpen(false)}
                        >
                          <LucideArrowRight className="size-4" />
                          Sign In
                        </Link>
                        <Link
                          route="new_account.create"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                          onClick={() => setProfileOpen(false)}
                        >
                          <LucideUserCircle className="size-4" />
                          Create Account
                        </Link>
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
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="cursor-pointer"
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
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden border-t border-white/10 bg-black/95 backdrop-blur-xl"
            >
              <ul className="flex flex-col px-6 py-4 gap-4 text-white/80 text-sm font-medium tracking-wide uppercase">
                <li>
                  <NavLink route="men">Men</NavLink>
                </li>
                <li>
                  <NavLink route="women">Women</NavLink>
                </li>
              </ul>
              {user ? (
                <div className="border-t border-white/10 px-6 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="size-8 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {user.initials}
                    </span>
                    <span className="text-sm text-white/70">{user.fullName}</span>
                  </div>
                  <Link
                    route="shops.dashboard.shop_dashboard.create"
                    className="flex items-center gap-3 text-sm text-white/70 hover:text-white transition-colors mb-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {shops.length > 0 && (
                      <>
                        <LucideStore className="size-4" />
                        View Shops
                      </>
                    )}
                  </Link>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false)
                      handleLogout()
                    }}
                    className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    <LucideLogOut className="size-4" />
                    Logout
                  </button>
                </div>
              ) : (
                <div className="border-t border-white/10 px-6 py-4 flex items-center gap-6 text-sm font-medium">
                  <Link
                    route="session.create"
                    className="text-white/70 hover:text-white transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    route="new_account.create"
                    className="text-white/70 hover:text-white transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Create Account
                  </Link>
                </div>
              )}
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
