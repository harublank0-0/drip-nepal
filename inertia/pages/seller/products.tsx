import { Head, usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { catalogEditable } from '@shared/ui/shop_access'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { can } from '~/lib/permissions'
import { Button } from '~/components/ui/button'
import { EmptyState } from '~/components/common/empty_state'
import { ProductFilters } from '~/components/seller/product_filters'
import { ProductsTable, type ProductListItem } from '~/components/seller/products_table'

/*
 * `/seller/{shopSlug}/products` (docs/08 §2.5 `/products` row, §7.2; 02
 * J-10 entry point; R1-S part 2f-i), rendered in the browser in the seller
 * layout. Its props are one cursor page of `listShopProducts` (`products`)
 * and the filters the server read from the URL (`filters`), so the filter
 * controls show the list's real state
 * (app/controllers/seller/catalog/products_controller.ts).
 *
 * "Add product" shows for a role with `shop.products.edit` while the shop
 * may change its catalogue (`catalogEditable`, the server's own gate). With
 * no product at all the page says how to start; with filters that match
 * nothing it offers to clear them (02 J-10 "Empty"). Cursors only go
 * forward: "Next page", and "Back to the first page" on a later page, each
 * keeping the filters (08 §7.2).
 */
type Props = InertiaProps<{
  products: { items: ProductListItem[]; meta: { limit: number; next_cursor: string | null } }
  filters: { status: string | null; q: string | null }
}>

export default function SellerProducts({ products, filters, current_shop: current }: Props) {
  // A later page carries a cursor in its URL; 08 §7.2 offers the way back.
  const onLaterPage = usePage().url.includes('cursor=')
  if (!current) return null
  const canAdd = can(current, 'shop.products.edit') && catalogEditable(current.status)
  const filtered = filters.status !== null || filters.q !== null
  const query: Record<string, string> = {}
  if (filters.status) query.status = filters.status
  if (filters.q) query.q = filters.q
  const next = products.meta.next_cursor
  return (
    <>
      <Head title={t('seller.products.page_title', { name: current.name })} />
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1
              tabIndex={-1}
              className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
            >
              {t('seller.products.heading')}
            </h1>
            <p className="text-muted-foreground max-w-prose">{t('seller.products.intro')}</p>
          </div>
          {canAdd && (
            <Button asChild className="h-11 text-base md:text-sm">
              <Link route="seller.products.new" routeParams={{ shopSlug: current.slug }}>
                {t('seller.products.add')}
              </Link>
            </Button>
          )}
        </header>
        {(filtered || products.items.length > 0) && (
          <ProductFilters shopSlug={current.slug} status={filters.status} q={filters.q} />
        )}
        {products.items.length === 0 ? (
          filtered ? (
            <EmptyState
              heading={t('seller.products.no_match_heading')}
              body={t('seller.products.no_match_body')}
            >
              <Link
                route="seller.products"
                routeParams={{ shopSlug: current.slug }}
                className="text-link underline-offset-4 hover:underline"
              >
                {t('seller.products.clear_filters')}
              </Link>
            </EmptyState>
          ) : (
            <EmptyState
              heading={t('seller.products.empty_heading')}
              body={
                canAdd ? t('seller.products.empty_body') : t('seller.products.empty_body_read_only')
              }
            />
          )
        ) : (
          <ProductsTable shopSlug={current.slug} products={products.items} />
        )}
        {(next || onLaterPage) && (
          <nav className="flex gap-4" aria-label={t('seller.products.pages')}>
            {onLaterPage && (
              <Link
                route="seller.products"
                routeParams={{ shopSlug: current.slug }}
                qs={query}
                className="text-link underline-offset-4 hover:underline"
              >
                {t('seller.products.first_page')}
              </Link>
            )}
            {next && (
              <Link
                route="seller.products"
                routeParams={{ shopSlug: current.slug }}
                qs={{ ...query, cursor: next }}
                className="text-link underline-offset-4 hover:underline"
              >
                {t('seller.products.next_page')}
              </Link>
            )}
          </nav>
        )}
      </div>
    </>
  )
}
