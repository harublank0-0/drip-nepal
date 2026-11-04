import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { router } from '@inertiajs/react'
import { SearchIcon, X } from 'lucide-react'
import { urlFor } from '~/client'
import {
  addRecentSearch,
  clearRecentSearches,
  readRecentSearches,
  removeRecentSearch,
} from '~/lib/recent_searches'
import { NoResults } from './no_results'
import { PopularCategories } from './popular_categories'
import { RecentSearches } from './recent_searches'
import { SearchResults } from './search_results'
import { SearchSkeleton } from './search_skeleton'
import type { SearchOption, SearchSuggestions } from './types'

type SearchModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 250

function searchUrl(term: string) {
  return urlFor('search', undefined, { qs: { q: term } })
}

/*
 * The navbar search. Suggests products and stores as you type (debounced,
 * stale responses dropped); Enter or "see all results" opens /search?q=.
 * Rendered inside the navbar's dialog, which unmounts it when closed.
 */
export function SearchModal({ onOpenChange }: SearchModalProps) {
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<{ term: string; data: SearchSuggestions } | null>(null)
  const [failedTerm, setFailedTerm] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [recent, setRecent] = useState<string[]>(readRecentSearches)

  const term = query.trim()
  const isSearchable = term.length >= MIN_QUERY_LENGTH
  const results = isSearchable ? (response?.data ?? null) : null
  const isLoading = isSearchable && response?.term !== term && failedTerm !== term
  const hasFailed = isSearchable && failedTerm === term && response?.term !== term
  const isEmpty = results !== null && results.products.length === 0 && results.stores.length === 0

  useEffect(() => {
    if (!isSearchable) return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch(urlFor('api.search.suggestions', undefined, { qs: { q: term } }), {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Suggestions failed with ${res.status}`)
          return res.json() as Promise<{ data: SearchSuggestions }>
        })
        .then((body) => {
          setResponse({ term, data: body.data })
          setActiveIndex(-1)
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailedTerm(term)
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [term, isSearchable])

  const options: SearchOption[] =
    results && !isEmpty
      ? [
          ...results.products.map((product) => ({
            type: 'product' as const,
            id: `${listboxId}-product-${product.id}`,
            href: urlFor('products.show', { slug: product.slug }),
            product,
          })),
          ...results.stores.map((store) => ({
            type: 'store' as const,
            id: `${listboxId}-store-${store.id}`,
            href: urlFor('stores.show', { slug: store.slug }),
            store,
          })),
          { type: 'all' as const, id: `${listboxId}-all`, href: searchUrl(term) },
        ]
      : []
  const activeOption = options[activeIndex]
  const activeId = activeOption?.id

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const remember = () => {
    if (term) setRecent(addRecentSearch(term))
  }

  const close = () => {
    remember()
    onOpenChange(false)
  }

  const visit = (href: string) => {
    close()
    router.visit(href)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % options.length)
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? options.length - 1 : index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (activeOption) visit(activeOption.href)
      else if (term) visit(searchUrl(term))
    }
  }

  const changeQuery = (value: string) => {
    setQuery(value)
    setActiveIndex(-1)
  }

  return (
    <div className="flex max-h-[85vh] min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4">
        <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search products, brands and stores..."
          aria-label="Search products, brands and stores"
          aria-autocomplete="list"
          aria-expanded={options.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="flex h-12 w-full bg-transparent py-3 text-base outline-none placeholder:text-muted-foreground/50 md:text-sm"
        />
        {isLoading && (
          <div
            role="status"
            aria-label="Searching"
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
          />
        )}
        {query && (
          <button
            type="button"
            onClick={() => {
              changeQuery('')
              inputRef.current?.focus()
            }}
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted"
            aria-label="Clear search"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        )}
        <kbd className="hidden shrink-0 items-center rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60 md:inline-flex">
          ESC
        </kbd>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {!isSearchable && (
          <div className="space-y-6">
            <RecentSearches
              items={recent}
              onSearch={(item) => {
                changeQuery(item)
                inputRef.current?.focus()
              }}
              onRemove={(item) => setRecent(removeRecentSearch(item))}
              onClear={() => setRecent(clearRecentSearches())}
            />
            <PopularCategories onNavigate={() => onOpenChange(false)} />
          </div>
        )}

        {isLoading && (results === null || isEmpty) && <SearchSkeleton />}

        {hasFailed && results === null && (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            Couldn&apos;t load suggestions. Press Enter to search for &ldquo;{term}&rdquo;.
          </p>
        )}

        {isSearchable && isEmpty && !isLoading && <NoResults query={term} onNavigate={close} />}

        {options.length > 0 && (
          <SearchResults
            listboxId={listboxId}
            options={options}
            activeIndex={activeIndex}
            term={term}
            onHover={setActiveIndex}
            onSelect={close}
          />
        )}
      </div>

      <div className="hidden items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground md:flex">
        <span>
          <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move
        </span>
        <span>
          <kbd className="font-sans">↵</kbd> to open
        </span>
        <span>
          <kbd className="font-sans">esc</kbd> to close
        </span>
      </div>
    </div>
  )
}
