import { Link } from '@adonisjs/inertia/react'
import { BadgeCheck, ChevronRight } from 'lucide-react'
import type { Data } from '@generated/data'

type StoreCardProps = {
  shop: Data.PublicShop
}

export function StoreCard({ shop }: StoreCardProps) {
  return (
    <Link
      route="stores.show"
      routeParams={{ slug: shop.slug }}
      className="group block overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 transition-colors hover:ring-foreground/25"
    >
      {shop.banner && (
        <div
          className="h-16 bg-muted bg-cover bg-center"
          style={{ backgroundImage: `url(${shop.banner})` }}
          aria-hidden="true"
        />
      )}

      <div className="flex items-center gap-4 p-4">
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-semibold uppercase ring-1 ring-foreground/10">
          {shop.logo ? (
            <img src={shop.logo} alt="" className="size-full object-cover" />
          ) : (
            <span aria-hidden="true">{shop.name.charAt(0)}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Sold by</p>
          <p className="flex items-center gap-1 font-heading font-semibold">
            <span className="truncate">{shop.name}</span>
            {shop.verifiedAt && (
              <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified shop" />
            )}
          </p>
          {shop.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{shop.description}</p>
          )}
        </div>

        <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          <span className="hidden sm:inline">Visit store</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      </div>
    </Link>
  )
}
