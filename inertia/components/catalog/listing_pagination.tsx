import { Link } from '@adonisjs/inertia/react'
import { t } from '~/lib/i18n'

/*
 * Page links of a listing (docs/08 §11.1): every page is an `<a href>` in
 * the server-rendered HTML, so paging works before JavaScript loads and is
 * crawlable (AC-J01-06); a page visit pushes history, and `onNavigate`
 * runs once it has arrived (the page moves focus to the results heading).
 * `href(page)` builds the URL in canonical order.
 */
export function ListingPagination({
  page,
  pages,
  href,
  onNavigate,
}: {
  page: number
  pages: number
  href: (page: number) => string
  onNavigate: () => void
}) {
  if (pages <= 1) return null
  // A page past the last links back into the listing, never to another empty page.
  const current = Math.min(page, pages + 1)
  const shown = [...new Set([1, current - 1, current, current + 1, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b)
  return (
    <nav aria-label={t('storefront.listing.pagination')} className="mt-8 flex justify-center">
      <ul className="flex flex-wrap items-center gap-1">
        {current > 1 ? (
          <li>
            <Link
              href={href(Math.min(current - 1, pages))}
              rel="prev"
              onSuccess={onNavigate}
              className="rounded-md px-3 py-2 hover:underline"
            >
              {t('storefront.listing.previous')}
            </Link>
          </li>
        ) : null}
        {shown.map((n) => (
          <li key={n}>
            {n === current ? (
              <span
                aria-current="page"
                className="bg-primary text-primary-foreground rounded-md px-3 py-2 font-medium"
              >
                <span className="sr-only">{t('storefront.listing.page_current_label')} </span>
                {n}
              </span>
            ) : (
              <Link
                href={href(n)}
                aria-label={t('storefront.listing.page', { page: n })}
                onSuccess={onNavigate}
                className="rounded-md px-3 py-2 hover:underline"
              >
                {n}
              </Link>
            )}
          </li>
        ))}
        {current < pages ? (
          <li>
            <Link
              href={href(current + 1)}
              rel="next"
              onSuccess={onNavigate}
              className="rounded-md px-3 py-2 hover:underline"
            >
              {t('storefront.listing.next')}
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  )
}
