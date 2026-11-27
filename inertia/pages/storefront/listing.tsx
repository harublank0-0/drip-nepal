import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { ChevronRightIcon } from 'lucide-react'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { EmptyState } from '~/components/common/empty_state'
import { PageSeo } from '~/components/seo/page_seo'
import { SocialMeta } from '~/components/seo/social_meta'
import { ListingPagination } from '~/components/storefront/listing_pagination'
import { ProductCard, type ListingCard } from '~/components/storefront/product_card'
import { EMPTY_LISTING_STATE, isUnrefined, listingUrl } from '@shared/ui/listing_url'

/*
 * The storefront listing pages (docs/08 §2.2, §3.1, §11.1; R1-S part
 * 3d-i): `/men`, `/women`, the navigation entries, `/c/{categorySlug}` and
 * `/search`. The server reads every filter from the URL and decides the
 * canonical link and robots tag; this page renders the heading, the count,
 * the grid and the page links. The filter panel, the sort control and the
 * search field come with part 3d-i-b.
 */
type Query = {
  q: string | null
  category: string | null
  values: Record<string, string[]>
  brand: string[]
  shop: string | null
  price_min_minor: number | null
  price_max_minor: number | null
  in_stock: boolean
  sort: string
  page: number
  per_page: number
}

type Props = InertiaProps<{
  base: {
    kind: 'navigation' | 'category' | 'search'
    path: string
    heading: string
    breadcrumbs: { label: string; href: string }[]
  }
  listing: {
    cards: ListingCard[]
    meta: {
      page: number
      per_page: number
      pages: number
      total: number
      total_is_capped: boolean
      has_more: boolean
    }
  }
  query: Query
  facets: {
    code: string
    name: string
    input: string
    values: { code: string; label: string; swatch_hex: string | null }[]
  }[]
  suggestions: { slug: string; name: string }[]
  seo: { canonical: string; noindex: boolean }
}>

function urlState(query: Query) {
  return {
    ...EMPTY_LISTING_STATE,
    q: query.q,
    category: query.category,
    values: query.values,
    brand: query.brand,
    shop: query.shop,
    priceMinMinor: query.price_min_minor,
    priceMaxMinor: query.price_max_minor,
    inStock: query.in_stock,
    sort: query.sort,
    page: query.page,
    perPage: query.per_page,
  }
}

export default function Listing({ base, listing, query, suggestions, seo }: Props) {
  const heading =
    base.kind === 'search'
      ? query.q
        ? t('storefront.listing.search_heading', { q: query.q })
        : t('storefront.listing.search_heading_empty')
      : base.heading
  const state = urlState(query)
  const refined = !isUnrefined(state)
  const { meta } = listing
  const count = meta.total_is_capped
    ? t('storefront.listing.count_capped', { count: meta.total })
    : t('storefront.listing.count', { count: meta.total })

  return (
    <>
      <Head title={heading} />
      <SocialMeta title={heading} />
      <PageSeo canonical={seo.canonical} noindex={seo.noindex} />
      <div className="mx-auto max-w-7xl py-4">
        {base.breadcrumbs.length > 0 ? (
          <nav aria-label={t('storefront.listing.breadcrumb')} className="mb-3 text-sm">
            <ol className="text-muted-foreground flex flex-wrap items-center gap-1">
              <li>
                <Link href="/" className="hover:underline">
                  {t('storefront.listing.home')}
                </Link>
              </li>
              {base.breadcrumbs.map((crumb, index) => (
                <li key={crumb.href} className="flex items-center gap-1">
                  <ChevronRightIcon aria-hidden="true" className="size-3.5" />
                  {index === base.breadcrumbs.length - 1 ? (
                    <span aria-current="page" className="text-foreground">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link href={crumb.href} className="hover:underline">
                      {crumb.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h1
            tabIndex={-1}
            className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
          >
            {heading}
          </h1>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {count}
          </p>
        </header>
        <section aria-label={t('storefront.listing.results')}>
          {listing.cards.length > 0 ? (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
              {listing.cards.map((card, index) => (
                <li key={card.public_id}>
                  <ProductCard card={card} eager={index < 4} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              heading={
                refined
                  ? t('storefront.listing.empty_refined_heading')
                  : t('storefront.listing.empty_heading')
              }
              body={
                refined
                  ? t('storefront.listing.empty_refined_body')
                  : t('storefront.listing.empty_body')
              }
            >
              <div className="flex flex-wrap justify-center gap-2">
                {refined ? (
                  <Link
                    href={listingUrl(base.path, {
                      ...EMPTY_LISTING_STATE,
                      q: query.q,
                      category: query.category,
                    })}
                    className="hover:underline"
                  >
                    {t('storefront.listing.clear_filters')}
                  </Link>
                ) : null}
                {suggestions.map((category) => (
                  <Link
                    key={category.slug}
                    href={`/c/${category.slug}`}
                    className="hover:underline"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </EmptyState>
          )}
        </section>
        <ListingPagination
          page={meta.page}
          pages={meta.pages}
          href={(page) => listingUrl(base.path, { ...state, page })}
        />
      </div>
    </>
  )
}
