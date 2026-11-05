import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '~/lib/utils'
import type { ListingContext, ListingFacets, ListingFilters } from '../types'
import type { useListingFilters } from '../use_listing_filters'
import { AppliedFilters } from './applied_filters'
import { SearchBox } from './search_box'
import { SortSelect } from './sort_select'

type ResultsToolbarProps = {
  context: ListingContext
  total: number
  facets: ListingFacets
  filters: ListingFilters
  listing: ReturnType<typeof useListingFilters>
  mobileFilters: ReactNode
}

const countFormatter = new Intl.NumberFormat('en-IN')

export function ResultsToolbar({
  context,
  total,
  facets,
  filters,
  listing,
  mobileFilters,
}: ResultsToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const isSearch = context.kind === 'search'
  const count = countFormatter.format(total)
  const resultText = isSearch
    ? context.query
      ? `${count} ${total === 1 ? 'result' : 'results'} for “${context.query}”`
      : `All products · ${count} ${total === 1 ? 'item' : 'items'}`
    : `${count} ${total === 1 ? 'product' : 'products'}`

  // Reserve navbar space globally; only results need the toolbar's extra offset.
  // Applying both globally makes native Tab focus scroll sticky controls away.
  useEffect(() => {
    const toolbar = toolbarRef.current
    if (!isSearch || !toolbar) return
    const root = document.documentElement
    const results = document.getElementById('product-results')
    const previous = root.style.scrollPaddingTop
    const previousMargin = results?.style.getPropertyValue('--listing-toolbar-h') ?? ''
    const measure = () => {
      const top = Number.parseFloat(getComputedStyle(toolbar).top) || 0
      root.style.scrollPaddingTop = `${top}px`
      results?.style.setProperty(
        '--listing-toolbar-h',
        `${toolbar.getBoundingClientRect().height + 16}px`
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(toolbar)
    return () => {
      observer.disconnect()
      root.style.scrollPaddingTop = previous
      if (previousMargin) results?.style.setProperty('--listing-toolbar-h', previousMargin)
      else results?.style.removeProperty('--listing-toolbar-h')
    }
  }, [isSearch])

  return (
    <div
      ref={toolbarRef}
      aria-label="Product discovery"
      className={cn(
        'border-b border-border pb-4',
        isSearch && 'sticky top-17 z-30 bg-background/95 pt-2 backdrop-blur-xl md:top-18'
      )}
    >
      {isSearch && (
        <SearchBox
          query={listing.query}
          isUpdating={listing.isUpdating}
          onQueryChange={listing.setQuery}
          onSubmit={listing.submitQuery}
          onClear={listing.clearQuery}
          onBlur={listing.rememberQuery}
          onCompositionChange={listing.setComposing}
        />
      )}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-x-3 gap-y-3',
          isSearch && 'pt-3'
        )}
      >
        <h2
          id="listing-results-heading"
          tabIndex={-1}
          className="min-w-0 basis-full text-sm font-normal break-words text-muted-foreground outline-none md:basis-auto md:flex-1"
        >
          <span role="status" aria-live="polite" aria-atomic="true">
            {resultText}
          </span>
        </h2>
        <div className="lg:hidden">{mobileFilters}</div>
        <SortSelect value={filters.sort} onChange={(sort) => listing.update({ sort })} />
      </div>
      <AppliedFilters
        facets={facets}
        filters={filters}
        onRemove={listing.remove}
        onPriceChange={listing.setPrice}
        onCategoryChange={isSearch ? (category) => listing.update({ category }) : undefined}
        onClear={listing.clear}
      />
    </div>
  )
}
