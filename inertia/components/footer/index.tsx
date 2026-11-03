import { Link } from '@adonisjs/inertia/react'
import { Separator } from '~/components/ui/separator'

const linkClass =
  'text-sm text-muted-foreground hover:text-foreground transition-colors duration-200'

export function Footer() {
  return (
    <footer role="contentinfo" className="bg-card border-t border-border/50">
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          <div className="lg:col-span-2">
            <Link route="home" aria-label="Drip Nepal home">
              <div className="uppercase text-3xl md:text-4xl font-bold tracking-tight mb-4">
                <span className="text-white">drip</span>
                <span className="text-primary">nepal</span>
              </div>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Fashion from local shops across Nepal. Order online and pay cash on delivery.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Shop</h3>
            <ul className="space-y-3">
              <li>
                <Link route="men" className={linkClass}>
                  Men
                </Link>
              </li>
              <li>
                <Link route="women" className={linkClass}>
                  Women
                </Link>
              </li>
              <li>
                <Link route="search" className={linkClass}>
                  All products
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Account</h3>
            <ul className="space-y-3">
              <li>
                <Link route="account.orders.index" className={linkClass}>
                  My orders
                </Link>
              </li>
              <li>
                <Link route="cart.show" className={linkClass}>
                  Cart
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Sell</h3>
            <ul className="space-y-3">
              <li>
                <Link route="ui.auth.shop.shop_registration.create" className={linkClass}>
                  Open a shop on Drip Nepal
                </Link>
              </li>
              <li>
                <Link route="ui.auth.user_session.create" className={linkClass}>
                  Seller login
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Drip Nepal. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
