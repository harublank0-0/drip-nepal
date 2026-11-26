import { Link } from '@adonisjs/inertia/react'
import { formatDateTime } from '@shared/format/date'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { StatusBadge } from '~/components/common/status_badge'
import { t } from '~/lib/i18n'

/*
 * The product list of `/seller/{shopSlug}/products` (docs/08 §2.5, §6.3,
 * §7.2; R1-S part 2f-i): a table from `md`, with a caption and column
 * headers, inside a labelled region that is its own scroll container and is
 * keyboard-focusable, and one card per product below `md`, with the same
 * fields. The title is the row's only link, to the product editor; no row
 * click handler. Publishing, unpublishing, archiving and restoring join
 * as row actions with R1-S part 2e.
 */
export type ProductListItem = {
  id: string
  public_id: string
  title: string
  status: string
  version: number
  variant_count: number
  updated_at: string
}

function ProductLink({ shopSlug, product }: { shopSlug: string; product: ProductListItem }) {
  return (
    <Link
      route="seller.products.edit"
      routeParams={{ shopSlug, productId: product.id }}
      className="text-link font-medium break-words underline-offset-4 hover:underline"
    >
      {product.title}
    </Link>
  )
}

export function ProductsTable({
  shopSlug,
  products,
}: {
  shopSlug: string
  products: ProductListItem[]
}) {
  return (
    <>
      <div
        role="region"
        aria-label={t('seller.products.table_label')}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling table region is keyboard-focusable (docs/08 §6.3)
        tabIndex={0}
        className="hidden overflow-x-auto rounded-md border md:block"
      >
        {/* ui/table's Table adds its own scroll container, so the table element is written here. */}
        <table className="w-full caption-bottom text-sm">
          <caption className="sr-only">{t('seller.products.table_label')}</caption>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead scope="col">{t('seller.products.column.title')}</TableHead>
              <TableHead scope="col">{t('seller.products.column.status')}</TableHead>
              <TableHead scope="col" className="text-end">
                {t('seller.products.column.variants')}
              </TableHead>
              <TableHead scope="col">{t('seller.products.column.updated')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="max-w-96 whitespace-normal">
                  <ProductLink shopSlug={shopSlug} product={product} />
                  <p className="text-muted-foreground text-xs">{product.public_id}</p>
                </TableCell>
                <TableCell>
                  <StatusBadge entity="product" state={product.status} />
                </TableCell>
                <TableCell className="text-end tabular-nums">{product.variant_count}</TableCell>
                <TableCell>{formatDateTime(product.updated_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label={t('seller.products.table_label')}>
        {products.map((product) => (
          <li key={product.id} className="space-y-2 rounded-md border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <ProductLink shopSlug={shopSlug} product={product} />
                <p className="text-muted-foreground text-xs">{product.public_id}</p>
              </div>
              <StatusBadge entity="product" state={product.status} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('seller.products.column.variants')}</dt>
              <dd className="tabular-nums">{product.variant_count}</dd>
              <dt className="text-muted-foreground">{t('seller.products.column.updated')}</dt>
              <dd>{formatDateTime(product.updated_at)}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}
