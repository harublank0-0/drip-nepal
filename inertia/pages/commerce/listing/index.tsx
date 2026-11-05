import { Head } from '@inertiajs/react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import CustomersLayout from '~/layouts/customers_layout'
import { CatalogProductCard } from '~/components/commerce/catalog_product_card'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import type { InertiaProps } from '~/types'
import type { Paginated } from '~/types/pagination'
import { EmptyState } from './components/empty_state'
import { FilterPanel } from './components/filter_panel'
import { ListingHeader } from './components/listing_header'
import { ListingPagination } from './components/listing_pagination'
import { MobileFilters } from './components/mobile_filters'
import { ResultsToolbar } from './components/results_toolbar'
import { useListingFilters } from './use_listing_filters'
import type { ListingContext, ListingFacets, ListingFilters } from './types'

type PageProps = InertiaProps<{
  context: ListingContext
  products: Paginated<Data.ProductCard>
  facets: ListingFacets
  filters: ListingFilters
}>

/*
 * Product listing shared by /men, /women, /categories/:slug, /search and
 * /stores/:slug. Filters and sort live in the query string.
 */
export default function ListingPage({ context, products, facets, filters }: PageProps) {
  const listing = useListingFilters(filters, context.kind === 'search' ? context.query : undefined)
  const isUpdating = listing.isUpdating
  const { metadata } = products
  const hasFilters = listing.activeCount > 0
  /*
   * Facets are empty only when nothing at all is listed in this scope.
   */
  const isSearch = context.kind === 'search'
  const canFilter = isSearch || hasFilters || facets.price.maxRupees > 0

  const panel = (
    <FilterPanel
      kind={context.kind}
      facets={facets}
      filters={filters}
      onToggle={listing.toggle}
      onPriceChange={listing.setPrice}
      onCategoryChange={isSearch ? (category) => listing.update({ category }) : undefined}
    />
  )

  return (
    <>
      <Head title={context.title} />

      <div className="mx-auto max-w-7xl px-4 pt-6 pb-20 md:px-8 md:pt-10">
        <ListingHeader context={context} total={metadata.total} hasFilters={hasFilters} />

        <div className={cn('flex gap-8', isSearch ? 'mt-4 md:mt-6' : 'mt-8')}>
          {canFilter && (
            <aside aria-labelledby="filters-heading" className="hidden w-60 shrink-0 lg:block">
              <div className="pb-6">
                <div className={cn('flex items-center justify-between', isSearch ? 'h-14' : 'h-9')}>
                  <h2 id="filters-heading" className="text-sm font-semibold">
                    Filters
                  </h2>
                  {hasFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={listing.clear}
                      className="text-muted-foreground"
                    >
                      Clear all
                    </Button>
                  )}
                </div>
                {panel}
              </div>
            </aside>
          )}

          <section aria-label="Products" className="min-w-0 flex-1">
            <ResultsToolbar
              context={context}
              total={metadata.total}
              facets={facets}
              filters={filters}
              listing={listing}
              mobileFilters={
                canFilter ? (
                  <MobileFilters
                    activeCount={listing.activeCount}
                    total={metadata.total}
                    isUpdating={isUpdating}
                    onClear={listing.clear}
                  >
                    {panel}
                  </MobileFilters>
                ) : null
              }
            />

            <div
              id="product-results"
              aria-busy={isUpdating}
              className={cn(
                'pt-5 transition-opacity duration-200 motion-reduce:transition-none [&_a]:scroll-mt-(--listing-toolbar-h) [&_button]:scroll-mt-(--listing-toolbar-h)',
                isUpdating && 'opacity-60'
              )}
            >
              {products.data.length > 0 ? (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
                  {products.data.map((product) => (
                    <li key={product.id} className="flex">
                      <CatalogProductCard product={product} className="w-full" />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  context={context}
                  hasFilters={hasFilters}
                  onClearFilters={listing.clear}
                  firstPageUrl={metadata.total > 0 ? listing.pageUrl(1) : undefined}
                />
              )}
            </div>

            <ListingPagination meta={metadata} pageUrl={listing.pageUrl} />
          </section>
        </div>
      </div>
    </>
  )
}

ListingPage.layout = [RootLayout, CustomersLayout]
