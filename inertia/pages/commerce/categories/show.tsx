import { useState, useMemo } from 'react'
import type { InertiaProps } from '~/types'
import { LayoutGrid, Columns3, Columns4 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { cn } from '~/lib/utils'
import { ProductGrid } from '~/components/commerce/product_grid'
import { Breadcrumb } from './components/breadcrumb'
import { CategoryHero } from './components/category_hero'
import { SortDropdown } from './components/sort_dropdown'
import { FilterSidebar } from './components/filter_sidebar'
import { MobileFilterDrawer } from './components/mobile_filter_drawer'
import { AppliedFilters } from './components/applied_filters'
import { QuickAddModal } from './components/quick_add_modal'
import { Pagination } from './components/pagination'
import { EmptyState } from './components/empty_state'
import { RecentlyViewed } from './components/recently_viewed'
import { RecommendedProducts } from './components/recommended_products'
import {
  getCategoryData,
  getDefaultFilterState,
  filterProducts,
  sortProducts,
  RECENTLY_VIEWED,
  RECOMMENDED_PRODUCTS,
  type FilterState,
  type CategoryProduct,
} from './mock'

type PageProps = InertiaProps<{ slug: string }>

const PRODUCTS_PER_PAGE = 12

export default function CategoryPage({ slug }: PageProps) {
  const data = useMemo(() => getCategoryData(slug), [slug])
  const [filters, setFilters] = useState<FilterState>(() => getDefaultFilterState(data))
  const [quickAddProduct, setQuickAddProduct] = useState<CategoryProduct | null>(null)

  const filtered = useMemo(() => {
    const f = filterProducts(data.products, filters)
    return sortProducts(f, filters.sort)
  }, [data.products, filters])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PRODUCTS_PER_PAGE))
  const paginated = filtered.slice(0, filters.page * PRODUCTS_PER_PAGE)

  const handleFilterChange = (next: FilterState) => {
    setFilters({ ...next, page: 1 })
  }

  const clearFilters = () => {
    setFilters({ ...getDefaultFilterState(data), view: filters.view, sort: filters.sort })
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-20 md:pt-24 pb-16">
        <Breadcrumb slug={slug} />
        <CategoryHero
          title={data.title}
          description={data.description}
          totalProducts={data.totalProducts}
          heroImage={data.heroImage}
        />

        <div className="flex gap-8">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:block w-64 xl:w-72 shrink-0">
            <div className="sticky top-28">
              <FilterSidebar data={data} filters={filters} onFilterChange={handleFilterChange} />
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-border">
              <p className="text-xs md:text-sm text-muted-foreground shrink-0">
                {filtered.length > 0
                  ? `${filtered.length} Product${filtered.length !== 1 ? 's' : ''}`
                  : 'No products'}
              </p>

              <div className="flex items-center gap-2">
                {/* View Toggle (desktop) */}
                <div className="hidden md:flex items-center border border-border rounded-md">
                  {(
                    [
                      { value: '2', icon: LayoutGrid },
                      { value: '3', icon: Columns3 },
                      { value: '4', icon: Columns4 },
                    ] as const
                  ).map(({ value, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilters({ ...filters, view: value })}
                      className={cn(
                        'p-1.5 transition-colors',
                        filters.view === value
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      aria-label={`${value} columns`}
                      aria-pressed={filters.view === value}
                    >
                      <Icon className="size-4" />
                    </button>
                  ))}
                </div>

                {/* Mobile filter button */}
                <div className="lg:hidden">
                  <MobileFilterDrawer
                    data={data}
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    resultCount={filtered.length}
                  />
                </div>

                <SortDropdown
                  value={filters.sort}
                  onChange={(sort) => setFilters({ ...filters, sort, page: 1 })}
                />
              </div>
            </div>

            {/* Applied Filters */}
            <AppliedFilters filters={filters} onFilterChange={handleFilterChange} />

            {/* Product Grid */}
            {filtered.length === 0 ? (
              <EmptyState onClearFilters={clearFilters} />
            ) : (
              <>
                <ProductGrid
                  products={paginated}
                  columns={filters.view}
                  onQuickAdd={setQuickAddProduct}
                  onWishlist={(id) => {
                    setFilters({
                      ...filters,
                      // Toggle wishlist would be a backend call; for now just a placeholder
                    })
                  }}
                />

                {/* Load More Button */}
                {paginated.length < filtered.length && (
                  <div className="flex justify-center mt-10">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                      className="px-10"
                    >
                      Load More ({filtered.length - paginated.length} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Recently Viewed */}
            <RecentlyViewed products={RECENTLY_VIEWED} />

            <Separator className="my-8" />

            {/* Recommended */}
            <RecommendedProducts products={RECOMMENDED_PRODUCTS} />
          </div>
        </div>
      </div>

      {/* Quick Add Modal */}
      <QuickAddModal product={quickAddProduct} onClose={() => setQuickAddProduct(null)} />
    </div>
  )
}
