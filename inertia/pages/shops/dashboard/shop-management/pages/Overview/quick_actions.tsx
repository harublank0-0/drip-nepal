import { ArrowRightIcon } from 'lucide-react'
import { Card, CardContent } from '~/components/ui/card'
import { SHOP_NAV_ITEMS } from '../../routes'

const quickLinks = SHOP_NAV_ITEMS.filter((item) =>
  [
    '/vendor/shop/general',
    '/vendor/shop/branding',
    '/vendor/shop/shipping',
    '/vendor/shop/payments',
    '/vendor/shop/security',
    '/vendor/shop/danger',
  ].includes(item.path)
)

export function QuickActions() {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {quickLinks.map((item) => (
          <a key={item.path} href={item.path}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="size-5" />
                </span>
                <span className="text-sm font-medium">{item.label}</span>
                <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  )
}
