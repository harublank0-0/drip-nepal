import { useState } from 'react'
import { router } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { SearchIcon } from 'lucide-react'
import { SEARCH_TERM_MAX, SEARCH_TERM_MIN, searchedTerm } from '@shared/ui/listing_url'
import { t } from '~/lib/i18n'
import { forgetRecentSearches, recentSearches, rememberRecentSearch } from '~/lib/recent_searches'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'

/*
 * The storefront header's search (docs/08 §2.7, §11.1; R1-S part 3d-iii-b):
 * a button that opens a labelled dialog with one search field. Enter starts
 * a new search, a plain visit to `/search?q=…` that pushes history (a new
 * query is a new place), and the term joins this browser's recent searches
 * after the visit starts. Under the field the recent searches, latest
 * first, are links to their results, with a button that clears them. A term
 * the server would refuse (under 2 or over 100 characters) starts nothing.
 */
const searchUrl = (term: string) => `/search?q=${encodeURIComponent(term)}`

export function SearchModal() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [recent, setRecent] = useState<string[]>([])

  function onOpenChange(next: boolean) {
    setOpen(next)
    // Each opening starts empty and shows the list as it is now.
    if (next) {
      setDraft('')
      setRecent(recentSearches())
    }
  }

  function search(term: string) {
    setOpen(false)
    router.visit(searchUrl(term), {
      onStart: () => rememberRecentSearch(term),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The trigger: focus returns to it when the dialog closes. */}
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon">
          <SearchIcon aria-hidden="true" />
          <span className="sr-only">{t('storefront.header.search')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('storefront.search.dialog_title')}</DialogTitle>
          <DialogDescription>{t('storefront.search.dialog_hint')}</DialogDescription>
        </DialogHeader>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            const term = searchedTerm(draft)
            const length = [...term].length
            if (length >= SEARCH_TERM_MIN && length <= SEARCH_TERM_MAX) search(term)
          }}
        >
          <label htmlFor="header-search" className="sr-only">
            {t('storefront.search.label')}
          </label>
          <input
            id="header-search"
            type="search"
            value={draft}
            maxLength={SEARCH_TERM_MAX}
            autoComplete="off"
            enterKeyHint="search"
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-11 w-full rounded-md border px-3 text-base outline-none focus-visible:ring-3 md:text-sm"
            onChange={(event) => setDraft(event.target.value)}
          />
        </form>
        {recent.length > 0 ? (
          <section aria-labelledby="recent-searches-heading" className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 id="recent-searches-heading" className="text-sm font-medium">
                {t('storefront.search.recent')}
              </h2>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={() => {
                  forgetRecentSearches()
                  setRecent([])
                }}
              >
                {t('storefront.search.clear_recent')}
              </Button>
            </div>
            <ul className="flex flex-col">
              {recent.map((term) => (
                <li key={term}>
                  <Link
                    href={searchUrl(term)}
                    className="hover:bg-muted focus-visible:ring-ring/50 block rounded-md px-2 py-2 text-sm outline-none focus-visible:ring-3"
                    onClick={() => {
                      setOpen(false)
                      rememberRecentSearch(term)
                    }}
                  >
                    {term}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
