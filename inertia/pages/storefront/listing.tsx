import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { ChevronRightIcon, SlidersHorizontalIcon } from 'lucide-react'
import { formatNPR } from '@shared/format/money'
import {
  clearRefinements,
  hasRefinements,
  LISTING_VALUE_ORDER,
  listingUrl,
  stateSort,
  toggleBrand,
  toggleValue,
  withQuery,
  type ListingUrlState,
} from '@shared/ui/listing_url'
import type { InertiaProps } from '~/types'
import { announce } from '~/lib/announce'
import { t } from '~/lib/i18n'
import { useListingFilters } from '~/hooks/use_listing_filters'
import { Button } from '~/components/ui/button'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '~/components/ui/sheet'
import { EmptyState } from '~/components/common/empty_state'
import { PageSeo } from '~/components/seo/page_seo'
import { SocialMeta } from '~/components/seo/social_meta'
import { FilterChips, type FilterChip } from '~/components/catalog/filter_chips'
import { ListingPagination } from '~/components/catalog/listing_pagination'
import {
  categoryTrail,
  ListingFilters,
  type BrandOption,
  type CategoryOption,
  type Facet,
} from '~/components/catalog/listing_filters'
import { ProductCard, type ListingCard } from '~/components/catalog/product_card'
import { SearchField } from '~/components/catalog/search_field'
import { SortSelect } from '~/components/catalog/sort_select'

/*
 * The storefront listing pages (docs/08 §2.2, §3.1, §11.1; R1-S part 3d-i):
 * `/men`, `/women`, the navigation entries, `/c/{categorySlug}` and
 * `/search`. The server reads every filter from the URL and decides the
 * canonical link and robots tag (part 3d-i-a). This page renders the
 * heading, the filter panel (a sidebar on wide screens, a sheet on phones),
 * the toolbar (on `/search` the search field; the count, the sort and the
 * applied filters as chips), the grid and the page links (part 3d-i-b).
 *
 * - A filter, sort or search change is a filter visit (`applyFilters`):
 *   focus stays on the control, and the new count is announced politely
 *   when the results arrive; meanwhile the results are `aria-busy` and
 *   dimmed. A page link moves focus to the results heading.
 * - The toolbar sticks to the top of the screen (the storefront header of
 *   part 3d-iii is not sticky); its measured height is the scroll margin of
 *   the results' links only, so a focused card is never under it while the
 *   toolbar's own controls scroll as usual.
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

type Meta = {
  page: number
  per_page: number
  pages: number
  total: number
  total_is_capped: boolean
  has_more: boolean
}

type Props = InertiaProps<{
  base: {
    kind: 'navigation' | 'category' | 'search'
    path: string
    heading: string
    breadcrumbs: { label: string; href: string }[]
  }
  listing: { cards: ListingCard[]; meta: Meta }
  query: Query
  facets: Facet[]
  brands: BrandOption[]
  categories: CategoryOption[]
  suggestions: { slug: string; name: string }[]
  seo: { canonical: string; noindex: boolean }
}>

const FILTER_FORM = 'listing-filters'

/*
 * After a page link: the visit mounts the page again, so the heading is
 * the new page's, found once it has rendered (as `useHeadingFocus` finds
 * it).
 */
function focusNewHeading() {
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#main h1')?.focus())
}

function urlState(query: Query): ListingUrlState {
  return {
    q: query.q,
    category: query.category,
    values: query.values,
    brand: query.brand,
    shop: query.shop,
    priceMinMinor: query.price_min_minor,
    priceMaxMinor: query.price_max_minor,
    inStock: query.in_stock,
    sort: stateSort(query.sort, query.q),
    page: query.page,
    perPage: query.per_page,
  }
}

function countText(meta: Pick<Meta, 'total' | 'total_is_capped'>, q: string | null) {
  if (q === null) {
    return meta.total_is_capped
      ? t('storefront.listing.count_capped', { count: meta.total })
      : t('storefront.listing.count', { count: meta.total })
  }
  return meta.total_is_capped
    ? t('storefront.listing.count_capped_for', { count: meta.total, q })
    : t('storefront.listing.count_for', { count: meta.total, q })
}

type RemovableChip = FilterChip & { remove: (state: ListingUrlState) => ListingUrlState }

const chip = (name: string, value: string) => t('storefront.filters.chip', { name, value })

// The applied filters, in URL order, each with what removing it leaves.
function chipsOf(
  state: ListingUrlState,
  facets: Facet[],
  brands: BrandOption[],
  categories: CategoryOption[]
): RemovableChip[] {
  const chips: RemovableChip[] = []
  if (state.category !== null) {
    const name = categoryTrail(categories, state.category)?.at(-1)?.name ?? state.category
    chips.push({
      key: 'category',
      label: chip(t('storefront.filters.category'), name),
      remove: (current) => ({ ...current, category: null }),
    })
  }
  const byCode = new Map(facets.map((facet) => [facet.code, facet]))
  const known = new Set<string>(LISTING_VALUE_ORDER)
  const codes = [
    ...LISTING_VALUE_ORDER,
    ...Object.keys(state.values)
      .filter((code) => !known.has(code))
      .sort(),
  ]
  for (const code of codes) {
    for (const value of state.values[code] ?? []) {
      const facet = byCode.get(code)
      const label = facet?.values.find((item) => item.code === value)?.label ?? value
      chips.push({
        key: `${code}:${value}`,
        label: chip(facet?.name ?? code, label),
        remove: (current) => toggleValue(current, code, value, false),
      })
    }
  }
  for (const slug of state.brand) {
    chips.push({
      key: `brand:${slug}`,
      label: chip(
        t('storefront.filters.brand'),
        brands.find((brand) => brand.slug === slug)?.name ?? slug
      ),
      remove: (current) => toggleBrand(current, slug, false),
    })
  }
  if (state.shop !== null) {
    chips.push({
      key: 'shop',
      label: chip(t('storefront.filters.shop'), state.shop),
      remove: (current) => ({ ...current, shop: null }),
    })
  }
  const { priceMinMinor: min, priceMaxMinor: max } = state
  if (min !== null || max !== null) {
    chips.push({
      key: 'price',
      label:
        min !== null && max !== null
          ? t('storefront.filters.chip_price_range', { min: formatNPR(min), max: formatNPR(max) })
          : min !== null
            ? t('storefront.filters.chip_price_min', { min: formatNPR(min) })
            : t('storefront.filters.chip_price_max', { max: formatNPR(max!) }),
      remove: (current) => ({ ...current, priceMinMinor: null, priceMaxMinor: null }),
    })
  }
  if (state.inStock) {
    chips.push({
      key: 'in_stock',
      label: t('storefront.filters.in_stock'),
      remove: (current) => ({ ...current, inStock: false }),
    })
  }
  return chips
}

export default function Listing({
  base,
  listing,
  query,
  facets,
  brands,
  categories,
  suggestions,
  seo,
}: Props) {
  const isSearch = base.kind === 'search'
  const heading = isSearch ? t('storefront.listing.search_heading') : base.heading
  const breadcrumbs = isSearch
    ? [{ label: t('storefront.listing.search_breadcrumb'), href: '/search' }]
    : base.breadcrumbs
  const { meta } = listing
  const { current, apply, pending } = useListingFilters(base.path, urlState(query), (props) => {
    const next = props as unknown as Pick<Props, 'listing' | 'query'>
    announce(countText(next.listing.meta, next.query.q))
  })
  const state = urlState(query)
  const filtered = hasRefinements(state)
  const chips = chipsOf(current, facets, brands, categories)
  // Past the last page of a listing that has products; an empty listing shows its own empty state.
  const pastLast = listing.cards.length === 0 && meta.page > 1 && meta.total > 0

  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusHeading = useCallback(() => headingRef.current?.focus(), [])

  const [sheetOpen, setSheetOpen] = useState(false)
  // "Show results" closes the sheet onto the results heading, not the Filters button.
  const closeToHeading = useRef(false)
  // "Clear all" mounts the panels again, so a typed amount and its error go too.
  const [panels, setPanels] = useState(0)
  function clearAll() {
    setPanels((count) => count + 1)
    return apply((last) => (hasRefinements(last) ? clearRefinements(last) : null))
  }

  const toolbar = useRef<HTMLDivElement>(null)
  const [toolbarHeight, setToolbarHeight] = useState(0)
  useEffect(() => {
    const element = toolbar.current
    if (!element) return
    const observer = new ResizeObserver(() => setToolbarHeight(element.offsetHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const filterPanel = (id: string, footer?: ReactNode) => (
    <ListingFilters
      key={`${id}-${panels}`}
      id={id}
      path={base.path}
      state={current}
      facets={facets}
      brands={brands}
      categories={categories}
      searchField={isSearch}
      onChange={apply}
      onSubmitted={
        id === FILTER_FORM
          ? undefined
          : () => {
              closeToHeading.current = true
              setSheetOpen(false)
            }
      }
      footer={footer}
    />
  )

  return (
    <>
      <Head title={heading} />
      <SocialMeta title={heading} />
      <PageSeo canonical={seo.canonical} noindex={seo.noindex} />
      <div className="mx-auto max-w-7xl py-4">
        {breadcrumbs.length > 0 ? (
          <nav aria-label={t('storefront.listing.breadcrumb')} className="mb-3 text-sm">
            <ol className="text-muted-foreground flex flex-wrap items-center gap-1">
              <li>
                <Link href="/" className="hover:underline">
                  {t('storefront.listing.home')}
                </Link>
              </li>
              {breadcrumbs.map((crumb, index) => (
                <li key={crumb.href} className="flex items-center gap-1">
                  <ChevronRightIcon aria-hidden="true" className="size-3.5" />
                  {index === breadcrumbs.length - 1 ? (
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
        <h1
          ref={headingRef}
          tabIndex={-1}
          className={
            isSearch
              ? 'font-heading mb-3 text-xl font-semibold tracking-tight outline-none'
              : 'font-heading mb-4 text-2xl font-semibold tracking-tight outline-none md:text-3xl'
          }
        >
          {heading}
        </h1>
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
          <aside aria-label={t('storefront.filters.heading')} className="hidden lg:block">
            {filterPanel(FILTER_FORM)}
          </aside>
          <div className="min-w-0">
            <div
              ref={toolbar}
              className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-10 -mx-4 mb-4 flex flex-col gap-3 border-b px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:mx-0 lg:px-0"
            >
              {isSearch ? (
                <SearchField
                  id="listing-search"
                  form={FILTER_FORM}
                  q={query.q}
                  onCommit={(q) => apply((last) => (last.q === q ? null : withQuery(last, q)))}
                />
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm">{countText(meta, query.q)}</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 lg:hidden"
                    onClick={() => setSheetOpen(true)}
                  >
                    <SlidersHorizontalIcon aria-hidden="true" />
                    {t('storefront.filters.open', { count: chips.length })}
                  </Button>
                  <SortSelect
                    id="listing-sort"
                    form={FILTER_FORM}
                    q={current.q}
                    sort={current.sort}
                    onChange={(sort) =>
                      apply((last) => {
                        const next = stateSort(sort, last.q)
                        return next === last.sort ? null : { ...last, sort: next }
                      })
                    }
                  />
                </div>
              </div>
              <FilterChips
                chips={chips}
                focusHeading={focusHeading}
                onRemove={(removed) =>
                  apply((last) => {
                    const found = chipsOf(last, facets, brands, categories).find(
                      (item) => item.key === removed.key
                    )
                    return found ? found.remove(last) : null
                  })
                }
                onClearAll={clearAll}
              />
            </div>
            <section
              aria-label={t('storefront.listing.results')}
              aria-busy={pending}
              style={{ '--toolbar-offset': `${toolbarHeight}px` } as CSSProperties}
              className={`transition-opacity duration-200 [&_a]:scroll-mt-[calc(var(--toolbar-offset)+0.5rem)] ${pending ? 'opacity-60' : ''}`}
            >
              {listing.cards.length > 0 ? (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 xl:grid-cols-4">
                  {listing.cards.map((card, index) => (
                    <li key={card.public_id}>
                      <ProductCard card={card} eager={index < 4} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  heading={
                    pastLast
                      ? t('storefront.listing.past_last_heading')
                      : filtered
                        ? t('storefront.listing.empty_refined_heading')
                        : t('storefront.listing.empty_heading')
                  }
                  body={
                    pastLast
                      ? t('storefront.listing.past_last_body')
                      : filtered
                        ? t('storefront.listing.empty_refined_body')
                        : t('storefront.listing.empty_body')
                  }
                >
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                    {pastLast ? (
                      <Link
                        href={listingUrl(base.path, { ...state, page: 1 })}
                        className="text-link underline"
                        onSuccess={focusNewHeading}
                      >
                        {t('storefront.listing.first_page')}
                      </Link>
                    ) : null}
                    {!pastLast && filtered ? (
                      <Link
                        href={listingUrl(base.path, clearRefinements(state))}
                        className="text-link underline"
                        onClick={(event: MouseEvent) => {
                          // A new tab or window opens the link as it is.
                          const modified = event.metaKey || event.ctrlKey || event.shiftKey
                          if (modified || event.altKey || event.button !== 0) return
                          // As "Clear all": a filter visit, then focus on the results heading.
                          event.preventDefault()
                          clearAll()
                          focusHeading()
                        }}
                      >
                        {t('storefront.listing.clear_filters')}
                      </Link>
                    ) : null}
                    {suggestions.map((category) => (
                      <Link
                        key={category.slug}
                        href={`/c/${category.slug}`}
                        className="text-link underline"
                      >
                        {category.name}
                      </Link>
                    ))}
                  </div>
                </EmptyState>
              )}
              <ListingPagination
                page={meta.page}
                pages={meta.pages}
                href={(page) => listingUrl(base.path, { ...state, page })}
                onNavigate={focusNewHeading}
              />
            </section>
          </div>
        </div>
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="left"
          className="w-[22rem] max-w-[90vw]"
          onCloseAutoFocus={(event) => {
            if (!closeToHeading.current) return
            closeToHeading.current = false
            event.preventDefault()
            focusHeading()
          }}
        >
          <SheetHeader className="border-b">
            <SheetTitle>{t('storefront.filters.heading')}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            {filterPanel(`${FILTER_FORM}-sheet`)}
          </div>
          <SheetFooter className="border-t">
            {/* Submits the sheet's form: its typed price is applied, or kept in view with its error. */}
            <Button type="submit" form={`${FILTER_FORM}-sheet`} aria-busy={pending}>
              {meta.total_is_capped
                ? t('storefront.filters.show_results_capped', { count: meta.total })
                : t('storefront.filters.show_results', { count: meta.total })}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
