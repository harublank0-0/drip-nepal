import { formatNPR } from '@shared/format/money'
import type { SellerProduct } from '@shared/ui/product_details'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { t } from '~/lib/i18n'

/*
 * A product's variants as saved (docs/08 §2.5 `/products/{productId}`;
 * R1-S part 2f-i): each variant's label, SKU, price, compare-at price,
 * stock on hand and whether it is archived, active ones first, as
 * `getShopProduct` lists them. A table from `md`, in a labelled,
 * keyboard-focusable scroll region, and one card per variant below `md`.
 * Prices come from the server in paisa and are shown with `formatNPR`
 * (docs/08 §5.11); stock on hand is the shop's own figure (04a §8.1).
 */
type Variant = SellerProduct['variants'][number]

function price(variant: Variant) {
  return variant.price.amount_minor === 0
    ? t('seller.product.variants.no_price')
    : formatNPR(variant.price.amount_minor)
}

function compareAt(variant: Variant) {
  return variant.compare_at_price
    ? formatNPR(variant.compare_at_price.amount_minor)
    : t('seller.product.variants.no_compare_at')
}

function label(variant: Variant) {
  const name = variant.is_default ? t('seller.product.variants.default') : variant.label
  return variant.status === 'archived'
    ? t('seller.product.variants.archived_label', { name })
    : name
}

export function ProductVariantsSummary({ variants }: { variants: Variant[] }) {
  return (
    <>
      <div
        role="region"
        aria-label={t('seller.product.variants.table_label')}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling table region is keyboard-focusable (docs/08 §6.3)
        tabIndex={0}
        className="hidden overflow-x-auto rounded-md border md:block"
      >
        <table className="w-full caption-bottom text-sm">
          <caption className="sr-only">{t('seller.product.variants.table_label')}</caption>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead scope="col">{t('seller.product.variants.column.variant')}</TableHead>
              <TableHead scope="col">{t('seller.product.variants.column.sku')}</TableHead>
              <TableHead scope="col" className="text-end">
                {t('seller.product.variants.column.price')}
              </TableHead>
              <TableHead scope="col" className="text-end">
                {t('seller.product.variants.column.compare_at')}
              </TableHead>
              <TableHead scope="col" className="text-end">
                {t('seller.product.variants.column.on_hand')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant) => (
              <TableRow key={variant.id}>
                <TableCell className="max-w-72 whitespace-normal">{label(variant)}</TableCell>
                <TableCell className="font-mono text-xs">{variant.sku}</TableCell>
                <TableCell className="text-end tabular-nums">{price(variant)}</TableCell>
                <TableCell className="text-end tabular-nums">{compareAt(variant)}</TableCell>
                <TableCell className="text-end tabular-nums">{variant.on_hand}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label={t('seller.product.variants.table_label')}>
        {variants.map((variant) => (
          <li key={variant.id} className="space-y-2 rounded-md border p-4">
            <p className="font-medium break-words">{label(variant)}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('seller.product.variants.column.sku')}</dt>
              <dd className="font-mono text-xs break-all">{variant.sku}</dd>
              <dt className="text-muted-foreground">{t('seller.product.variants.column.price')}</dt>
              <dd className="tabular-nums">{price(variant)}</dd>
              <dt className="text-muted-foreground">
                {t('seller.product.variants.column.compare_at')}
              </dt>
              <dd className="tabular-nums">{compareAt(variant)}</dd>
              <dt className="text-muted-foreground">
                {t('seller.product.variants.column.on_hand')}
              </dt>
              <dd className="tabular-nums">{variant.on_hand}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}
