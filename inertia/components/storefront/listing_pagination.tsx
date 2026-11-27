import { Link } from '@adonisjs/inertia/react'
import { t } from '~/lib/i18n'

/*
 * Page links of a listing (docs/08 §11.1): every page is an `<a href>` in
 * the server-rendered HTML, so paging works before JavaScript loads and is
 * crawlable (AC-J01-06); a page visit pushes history. `href(page)` builds
 * the URL in canonical order.
 */
export function ListingPagination({
  page,
  pages,
  href,
}: {
  page: number
  pages: number
  href: (page: number) => string
}) {
  if (pages <= 1) return null
  const shown = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b)
  return (
    <nav aria-label={t('storefront.listing.pagination')} className="mt-8 flex justify-center">
      <ul className="flex flex-wrap items-center gap-1">
        {page > 1 ? (
          <li>
            <Link href={href(page - 1)} rel="prev" className="rounded-md px-3 py-2 hover:underline">
              {t('storefront.listing.previous')}
            </Link>
          </li>
        ) : null}
        {shown.map((n) => (
          <li key={n}>
            {n === page ? (
              <span
                aria-current="page"
                aria-label={t('storefront.listing.page_current', { page: n })}
                className="bg-primary text-primary-foreground rounded-md px-3 py-2 font-medium"
              >
                {n}
              </span>
            ) : (
              <Link
                href={href(n)}
                aria-label={t('storefront.listing.page', { page: n })}
                className="rounded-md px-3 py-2 hover:underline"
              >
                {n}
              </Link>
            )}
          </li>
        ))}
        {page < pages ? (
          <li>
            <Link href={href(page + 1)} rel="next" className="rounded-md px-3 py-2 hover:underline">
              {t('storefront.listing.next')}
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  )
}
