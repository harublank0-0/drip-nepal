import { router } from '@inertiajs/react'
import { listingUrl, type ListingUrlState } from '@shared/ui/listing_url'

/*
 * The listing's filter visit (docs/08 §11.1 "Visits", the `applyFilters` of
 * its sketch; docs/09 §13 URL builder; R1-S part 3d-i-b): a GET to the
 * canonical URL of the new filters, built as a string with `listingUrl` and
 * sent with empty `data` (Inertia would write `apparel_size[]=m`). Any
 * filter or sort change starts again from the first page. The visit keeps
 * the page's state and its scroll, in the sidebar and the phone sheet
 * alike; it replaces the history entry, so Back leaves the listing instead
 * of undoing a click; and it reloads only the props a filter changes
 * (`base` never does).
 */
export const LISTING_FILTER_PROPS = [
  'listing',
  'query',
  'facets',
  'brands',
  'categories',
  'suggestions',
  'seo',
]

export function applyFilters(
  path: string,
  state: ListingUrlState,
  options: {
    onStart?: () => void
    onFinish?: () => void
    onSuccess?: (props: Record<string, unknown>) => void
  } = {}
) {
  router.get(
    listingUrl(path, { ...state, page: 1 }),
    {},
    {
      preserveState: true,
      preserveScroll: true,
      replace: true,
      only: LISTING_FILTER_PROPS,
      onStart: options.onStart,
      onFinish: options.onFinish,
      onSuccess: (page) => options.onSuccess?.(page.props),
    }
  )
}
