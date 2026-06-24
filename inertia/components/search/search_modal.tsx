import { useState, useCallback, useEffect, useRef, startTransition } from 'react'
import { motion } from 'framer-motion'
import { Command } from '~/components/ui/command'
import { ScrollArea } from '~/components/ui/scroll_area'
import { RecentSearches } from './recent_searches'
import { TrendingSearches } from './trending_searches'
import { PopularCategories } from './popular_categories'
import { PopularStores } from './popular_stores'
import { RecommendedProducts } from './recommended_products'
import { SearchResults } from './search_results'
import { SearchSkeleton } from './search_skeleton'
import { NoResults } from './no_results'
import {
  filterProducts,
  filterStores,
  filterCategories,
  searchProducts,
  RECENT_SEARCHES,
  TRENDING_SEARCHES,
  mockProducts,
  mockStores,
  mockCategories,
} from './mock_data'
import type { SearchState, SearchResults as SearchResultsType } from './types'

type SearchModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SearchModal({ open, onOpenChange }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState>('empty')
  const [results, setResults] = useState<SearchResultsType>({
    products: [],
    stores: [],
    categories: [],
    suggestions: [],
  })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recentSearches, setRecentSearches] = useState<string[]>(RECENT_SEARCHES)

  const inputRef = useRef<HTMLInputElement>(null)

  const addRecent = useCallback((item: string) => {
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s !== item)
      return [item, ...filtered].slice(0, 5)
    })
  }, [])

  const removeRecent = useCallback((item: string) => {
    setRecentSearches((prev) => prev.filter((s) => s !== item))
  }, [])

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q)
      addRecent(q)
    },
    [addRecent]
  )

  useEffect(() => {
    if (open) {
      startTransition(() => {
        setQuery('')
        setState('empty')
        setSelectedIndex(0)
      })
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!query.trim()) {
      startTransition(() => {
        setState('empty')
        setSelectedIndex(0)
      })
      return
    }

    startTransition(() => setState('loading'))

    const timer = setTimeout(() => {
      const products = filterProducts(query)
      const stores = filterStores(query)
      const categories = filterCategories(query)
      const suggestions = searchProducts(query)

      if (
        products.length === 0 &&
        stores.length === 0 &&
        categories.length === 0 &&
        suggestions.length === 0
      ) {
        startTransition(() => setState('no-results'))
      } else {
        startTransition(() => {
          setResults({ products, stores, categories, suggestions })
          setState('results')
          setSelectedIndex(0)
        })
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  const totalItems =
    state === 'results'
      ? results.suggestions.length +
        results.products.length +
        results.stores.length +
        results.categories.length
      : 0

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (state !== 'results') return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, totalItems - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && totalItems > 0) {
        e.preventDefault()
        const suggestionCount = results.suggestions.length
        const productCount = results.products.length
        const storeCount = results.stores.length

        let idx = selectedIndex

        if (idx < suggestionCount) {
          setQuery(results.suggestions[idx].text)
          return
        }
        idx -= suggestionCount

        if (idx < productCount) {
          addRecent(results.products[idx].name)
          onOpenChange(false)
          return
        }
        idx -= productCount

        if (idx < storeCount) {
          addRecent(results.stores[idx].name)
          onOpenChange(false)
        }
      }
    },
    [state, results, selectedIndex, totalItems, addRecent, onOpenChange]
  )

  return (
    <Command shouldFilter={false} onKeyDown={handleKeyDown} className="rounded-none sm:rounded-xl">
      <div className="flex items-center gap-3 border-b border-border px-4">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted-foreground/60 shrink-0"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products, brands and stores..."
          className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Search products, brands and stores"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="size-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors shrink-0"
            aria-label="Clear search"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-muted-foreground/60"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
        {state === 'loading' && (
          <div className="size-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin shrink-0" />
        )}
        <kbd className="hidden md:inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60 shrink-0">
          ESC
        </kbd>
      </div>

      <ScrollArea className="max-h-[60vh] overflow-y-auto">
        <div className="p-3">
          {state === 'empty' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <RecentSearches
                items={recentSearches}
                onSearch={handleSearch}
                onRemove={removeRecent}
              />
              <TrendingSearches items={TRENDING_SEARCHES} onSearch={handleSearch} />
              <PopularCategories categories={mockCategories} />
              <PopularStores stores={mockStores} />
              <RecommendedProducts products={mockProducts} />
            </motion.div>
          )}

          {state === 'loading' && <SearchSkeleton />}

          {state === 'results' && <SearchResults results={results} selectedIndex={selectedIndex} />}

          {state === 'no-results' && <NoResults query={query} onSearch={handleSearch} />}
        </div>
      </ScrollArea>
    </Command>
  )
}
