import { usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import type { Data } from '@generated/data'
import { Separator } from '~/components/ui/separator'
import { currentYear } from '~/lib/format'

const linkClass =
  'inline-flex min-h-9 items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200'

const headingClass = 'mb-2 text-sm font-semibold'

export function Footer() {
  const { shopRegistrationOpen, support } = usePage<Data.SharedProps>().props
  const socials = [
    { label: 'Instagram', href: support.instagram },
    { label: 'Facebook', href: support.facebook },
    { label: 'TikTok', href: support.tiktok },
  ].filter((social): social is { label: string; href: string } => Boolean(social.href))
  const hasContact = Boolean(support.phone || support.email)

  return (
    <footer role="contentinfo" className="bg-card border-t border-border/50">
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-10 md:py-16">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-6 gap-y-8 lg:gap-12">
          <div className="col-span-2">
            <Link route="home" aria-label="Drip Nepal home">
              <div className="uppercase text-3xl md:text-4xl font-bold tracking-tight mb-3">
                <span className="text-foreground">drip</span>
                <span className="text-primary">nepal</span>
              </div>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Fashion from local shops across Nepal. Order online and pay cash on delivery.
            </p>
            {socials.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-x-5">
                {socials.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className={headingClass}>Shop</h3>
            <ul>
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
              {shopRegistrationOpen && (
                <li>
                  <Link route="ui.auth.shop.shop_registration.create" className={linkClass}>
                    Sell on Drip Nepal
                  </Link>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h3 className={headingClass}>Help</h3>
            <ul>
              <li>
                <Link route="orders.track" className={linkClass}>
                  Track order
                </Link>
              </li>
              <li>
                <Link route="account.orders.index" className={linkClass}>
                  My orders
                </Link>
              </li>
              <li>
                <Link route="legal.returns" className={linkClass}>
                  Returns and refunds
                </Link>
              </li>
              <li>
                <Link route="legal.terms" className={linkClass}>
                  Terms
                </Link>
              </li>
              <li>
                <Link route="legal.privacy" className={linkClass}>
                  Privacy
                </Link>
              </li>
            </ul>
          </div>

          {hasContact && (
            <div className="col-span-2 lg:col-span-1">
              <h3 className={headingClass}>Contact</h3>
              <ul>
                {support.whatsapp && (
                  <li>
                    <a
                      href={support.whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                    >
                      WhatsApp
                    </a>
                  </li>
                )}
                {support.phone && (
                  <li>
                    <a href={`tel:${support.phone.replace(/\s/g, '')}`} className={linkClass}>
                      {support.phone}
                    </a>
                  </li>
                )}
                {support.email && (
                  <li>
                    <a href={`mailto:${support.email}`} className={linkClass}>
                      {support.email}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <Separator className="my-8" />

        <p className="text-xs text-muted-foreground">
          &copy; {currentYear()} Drip Nepal. Cash on delivery across Nepal.
        </p>
      </div>
    </footer>
  )
}
