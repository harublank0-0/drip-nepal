import { Link } from '@adonisjs/inertia/react'
import { PriceTag } from '~/components/storefront/price_tag'
import { t } from '~/lib/i18n'

export type ListingCard = {
  public_id: string
  href: string
  title: string
  shop: { slug: string; name: string }
  brand: { slug: string; name: string } | null
  price_min: { amount_minor: number; currency: string }
  price_max: { amount_minor: number; currency: string }
  compare_at: { amount_minor: number; currency: string } | null
  in_stock: boolean
  image: { alt: string; src: string; srcset: string }
}

/*
 * A product on a listing (docs/08 §4 `ProductCard`): the whole card is one
 * link to the product page; the image keeps a square box so the grid does
 * not move while it loads (§10.4); nothing appears only on hover. A sold
 * out product says so in text, not by colour alone.
 */
export function ProductCard({ card, eager = false }: { card: ListingCard; eager?: boolean }) {
  return (
    <Link
      href={card.href}
      className="group focus-visible:ring-ring block rounded-lg outline-none focus-visible:ring-2"
    >
      <div className="bg-muted aspect-square overflow-hidden rounded-lg">
        {card.image.src ? (
          <img
            src={card.image.src}
            srcSet={card.image.srcset}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            alt={card.image.alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="space-y-1 pt-2">
        <p className="text-muted-foreground truncate text-xs">
          {card.brand?.name ?? card.shop.name}
        </p>
        <h2 className="line-clamp-2 text-sm font-medium group-hover:underline">{card.title}</h2>
        <PriceTag min={card.price_min} max={card.price_max} compareAt={card.compare_at} />
        {card.in_stock ? null : (
          <p className="text-muted-foreground text-xs">{t('storefront.price.sold_out')}</p>
        )}
      </div>
    </Link>
  )
}
