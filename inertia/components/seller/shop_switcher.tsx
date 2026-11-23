import { Link } from '@adonisjs/inertia/react'
import { ChevronsUpDownIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { t } from '~/lib/i18n'
import type { CurrentShop } from '~/lib/permissions'

/*
 * `ShopSwitcher` (docs/08 §4.3, §2.5; FR-SHOP-006): the shops the user owns
 * or works in, from the `seller_shops` shared prop only. With one shop it
 * is just the shop's name. With more, a menu of links: each opens that
 * shop's overview, the one page every role may open (the other pages join
 * with R1-S parts 1b and 1c, and the switch keeps the sub-page once they
 * exist). The current shop is marked with text and `aria-current`, not by
 * colour alone (SC 1.4.1). Links, not a select that navigates on change
 * (SC 3.2.2).
 */
type SellerShop = NonNullable<Data.SharedProps['seller_shops']>[number]

export function ShopSwitcher({ current, shops }: { current: CurrentShop; shops: SellerShop[] }) {
  if (shops.length <= 1) {
    return <span className="truncate font-semibold">{current.name}</span>
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="max-w-64 min-w-0 justify-between gap-2 font-semibold"
          aria-label={t('seller.switcher.label', { name: current.name })}
        >
          <span className="truncate">{current.name}</span>
          <ChevronsUpDownIcon aria-hidden="true" className="shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t('seller.switcher.heading')}</DropdownMenuLabel>
        {shops.map((shop) => {
          const isCurrent = shop.slug === current.slug
          return (
            <DropdownMenuItem key={shop.slug} asChild>
              <Link
                route="seller.overview"
                routeParams={{ shopSlug: shop.slug }}
                aria-current={isCurrent ? 'page' : undefined}
                className="flex flex-col items-start gap-0"
              >
                <span className={isCurrent ? 'font-semibold' : undefined}>
                  {shop.name} {isCurrent && t('seller.switcher.current')}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t(`seller.role.${shop.role}` as Parameters<typeof t>[0])}
                </span>
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
