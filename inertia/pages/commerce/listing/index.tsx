import { Head } from '@inertiajs/react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import CustomersLayout from '~/layouts/customers_layout'
import { CatalogProductCard } from '~/components/commerce/catalog_product_card'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import type { InertiaProps } from '~/types'
import type { Paginated } from '~/types/pagination'
import { AppliedFilters } from './components/applied_filters'
import { EmptyState } from './components/empty_state'
import { FilterPanel } from './components/filter_panel'
import { ListingHeader } from './components/listing_header'
import { ListingPagination } from './components/listing_pagination'
import { MobileFilters } from './components/mobile_filters'
import { SortSelect } from './components/sort_select'
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
  const { metadata } = products
  const hasFilters = listing.activeCount > 0
  /*
   * Facets are empty only when nothing at all is listed in this scope.
   */
  const canFilter = hasFilters || facets.price.max > 0
  const firstItem = (metadata.currentPage - 1) * metadata.perPage + 1
  const lastItem = firstItem + products.data.length - 1

  const panel = (
    <FilterPanel
      kind={context.kind}
      facets={facets}
      filters={filters}
      onToggle={listing.toggle}
      onPriceChange={listing.setPrice}
    />
  )

  return (
    <>
      <Head title={context.title} />

      <div className="mx-auto max-w-7xl px-4 pt-6 pb-20 md:px-8 md:pt-10">
        <ListingHeader context={context} total={metadata.total} hasFilters={hasFilters} />

        <div className="mt-8 flex gap-10">
          {canFilter && (
            <aside aria-labelledby="filters-heading" className="hidden w-60 shrink-0 lg:block">
              <div className="pb-6">
                <div className="flex h-9 items-center justify-between">
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
            <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
              <div className={cn('lg:hidden', !canFilter && 'invisible')}>
                <MobileFilters
                  activeCount={listing.activeCount}
                  total={metadata.total}
                  isUpdating={listing.isUpdating}
                  onClear={listing.clear}
                >
                  {panel}
                </MobileFilters>
              </div>
              <p className="hidden text-sm text-muted-foreground lg:block">
                {metadata.lastPage > 1
                  ? `Showing ${firstItem}–${lastItem} of ${metadata.total}`
                  : null}
              </p>
              <SortSelect value={filters.sort} onChange={(sort) => listing.update({ sort })} />
            </div>

            <AppliedFilters
              facets={facets}
              filters={filters}
              onToggle={listing.toggle}
              onPriceChange={listing.setPrice}
              onClear={listing.clear}
            />

            <div
              aria-busy={listing.isUpdating}
              className={cn(
                'pt-6 transition-opacity duration-200',
                listing.isUpdating && 'opacity-50'
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
