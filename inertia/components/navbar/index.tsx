import { useState, useEffect } from 'react'
import { usePage } from '@inertiajs/react'
import { LucideSearch, LucideShoppingBag, LucideUser, LucideMenu, LucideX } from 'lucide-react'
import { NavLink } from './nav_link'
import { Link } from '@adonisjs/inertia/react'
import { cn } from '~/lib/utils'
import { routes } from '@generated/registry'
import { Button } from '~/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'

export const NavBar = () => {
  const { url } = usePage()
  const isHomePage = routes.home.pattern === url
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80)
    if (isHomePage) {
      window.addEventListener('scroll', handleScroll, { passive: true })
      handleScroll()
    }
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isHomePage])

  return (
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

        <ul className="flex gap-4 md:gap-6 text-white/80">
          <li>
            <Button variant="ghost" size="icon-sm" aria-label="Search products">
              <LucideSearch className="size-5" />
            </Button>
          </li>
          <li className="hidden sm:block">
            <Button variant="ghost" size="icon-sm" aria-label="Shopping bag">
              <LucideShoppingBag className="size-5" />
            </Button>
          </li>
          <li className="hidden sm:block">
            <Button variant="ghost" size="icon-sm" aria-label="User account">
              <LucideUser className="size-5" />
            </Button>
          </li>
          <li className="md:hidden">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <LucideX className="size-5" /> : <LucideMenu className="size-5" />}
            </Button>
          </li>
        </ul>
      </nav>

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
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
