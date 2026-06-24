import { Link } from '@adonisjs/inertia/react'
import { type routes } from '@generated/registry'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { Globe } from 'lucide-react'

const shopLinks: { label: string; route: keyof typeof routes }[] = [
  { label: 'Men', route: 'men' },
  { label: 'Women', route: 'women' },
]

const helpLinks = [
  { label: 'FAQ', href: '#' },
  { label: 'Shipping', href: '#' },
  { label: 'Returns', href: '#' },
  { label: 'Size Guide', href: '#' },
]

const aboutLinks = [
  { label: 'Our Story', href: '#' },
  { label: 'Careers', href: '#' },
  { label: 'Sustainability', href: '#' },
  { label: 'Press', href: '#' },
]

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
              Himalayan streetwear curated for the bold. Premium drops from the world&apos;s most
              sought-after brands, delivered to your doorstep.
            </p>

            <div className="flex gap-3 mt-6">
              {[
                { icon: Globe, label: 'Website' },
                { icon: Globe, label: 'Instagram' },
                { icon: Globe, label: 'Twitter' },
                { icon: Globe, label: 'YouTube' },
              ].map(({ icon: Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="size-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors duration-300"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Shop</h3>
            <ul className="space-y-3">
              {shopLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    route={link.route}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Help</h3>
            <ul className="space-y-3">
              {helpLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">About</h3>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Drip Nepal. All rights reserved.
          </p>

          <div className="flex items-center gap-4">
            <a
              href="#"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy Policy
            </a>
            <span className="text-muted-foreground/30">&middot;</span>
            <a
              href="#"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
