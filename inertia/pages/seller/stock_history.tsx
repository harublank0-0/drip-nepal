import { useState } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { toast } from 'sonner'
import { formatDateTime } from '@shared/format/date'
import { stockChangesOffered } from '@shared/ui/stock'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { can } from '~/lib/permissions'
import { Button } from '~/components/ui/button'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { StatusBadge } from '~/components/common/status_badge'
import { movementWhat } from '~/components/seller/inventory_table'
import {
  AdjustStockDialog,
  CountStockDialog,
  type StockVariant,
} from '~/components/seller/stock_dialogs'

/*
 * `/seller/{shopSlug}/inventory/{variantId}`, a variant's stock and its
 * history (docs/08 §2.5; 02 J-11 step 4; R1-S part 2f-iv-b), rendered in the
 * browser in the seller layout. Its props are the variant with its product
 * and its stock now (`variant`) and one cursor page of its movements,
 * newest first (`movements`): when, what (the kind, or an adjustment's
 * reason), the change to on hand and to reserved, who (a role, never a
 * name), the note, and the request ID support can trace
 * (app/controllers/seller/inventory).
 *
 * The stock list's variant names and the product editor's stock counts
 * link here (02 J-11 "Entry points"). A role with `shop.inventory.adjust`
 * in an `active` shop gets "Adjust stock" and "Count stock", the stock
 * list's dialogs; an archived variant's stock may still be changed (05
 * §5.9). After a save a toast gives the new on-hand number and the page is
 * read again; the dialog returns focus to the button that opened it (08
 * §7.3 rule 1). Cursors go forward only (08 §7.2).
 */
type Movement = {
  id: string
  kind: string
  reason_code: string
  on_hand_delta: number
  reserved_delta: number
  note: string | null
  actor: string
  request_id: string | null
  created_at: string
}

type Props = InertiaProps<{
  variant: StockVariant & {
    is_default: boolean
    status: 'active' | 'archived'
    available: number
    version: number
    product: { product_id: string; public_id: string; title: string; status: string }
  }
  movements: { items: Movement[]; meta: { limit: number; next_cursor: string | null } }
}>

const ACTOR_LABEL: Record<string, Parameters<typeof t>[0]> = {
  you: 'seller.stock.actor.you',
  owner: 'seller.role.owner',
  manager: 'seller.role.manager',
  catalog_editor: 'seller.role.catalog_editor',
  order_fulfiller: 'seller.role.order_fulfiller',
  viewer: 'seller.role.viewer',
  former_member: 'seller.stock.actor.former_member',
  staff: 'seller.stock.actor.staff',
  order: 'seller.stock.actor.order',
  system: 'seller.stock.actor.system',
}

const ACTION_IDS = { adjust: 'stock-history-adjust', count: 'stock-history-count' } as const

// A delta with its sign, or a dash, read "no change", when it moved nothing.
function Signed({ delta }: { delta: number }) {
  if (delta !== 0) return <>{delta > 0 ? `+${delta}` : `${delta}`}</>
  return (
    <>
      <span aria-hidden="true">{t('seller.stock.no_change_mark')}</span>
      <span className="sr-only">{t('seller.stock.no_change_short')}</span>
    </>
  )
}

export default function SellerStockHistory({ variant, movements, current_shop: current }: Props) {
  const onLaterPage = usePage().url.includes('cursor=')
  const [dialog, setDialog] = useState<'adjust' | 'count' | null>(null)
  const [open, setOpen] = useState(false)
  // Each opening mounts a fresh dialog, so it starts empty.
  const [turn, setTurn] = useState(0)
  if (!current) return null
  const mayChange = stockChangesOffered(current.status, (permission) => can(current, permission))
  const name = variant.is_default ? t('seller.stock.default_variant') : variant.label
  const next = movements.meta.next_cursor
  // Stale numbers (a refusal, a timeout) are read again in place, so an open dialog keeps its state.
  const reload = () => router.reload({ only: ['variant', 'movements'] })
  // After a save the newest movements show: an older cursor page goes back to the first, keeping
  // the page mounted so focus stays on the button the dialog returned it to.
  const showNewest = () =>
    onLaterPage
      ? router.visit(window.location.pathname, {
          only: ['variant', 'movements'],
          preserveState: true,
          preserveScroll: true,
          replace: true,
        })
      : reload()
  const tableName = t('seller.stock.history_table', { sku: variant.sku })

  function openDialog(action: 'adjust' | 'count') {
    setDialog(action)
    setTurn((previous) => previous + 1)
    setOpen(true)
  }

  const dialogProps = {
    shopSlug: current.slug,
    variant,
    open,
    onOpenChange: setOpen,
    onSaved: (saved: StockVariant, onHand: number) => {
      toast.success(t('seller.stock.saved', { sku: saved.sku, on_hand: onHand }))
      showNewest()
    },
    onStale: reload,
    onCloseAutoFocus: (event: Event) => {
      // Opened from a plain button: focus goes back to it (08 §7.3 rule 1).
      event.preventDefault()
      if (dialog) document.getElementById(ACTION_IDS[dialog])?.focus()
    },
  }

  return (
    <>
      <Head
        title={t('seller.stock.history_page_title', { sku: variant.sku, name: current.name })}
      />
      <div className="max-w-4xl space-y-6">
        <div className="space-y-4">
          <Link
            route="seller.inventory"
            routeParams={{ shopSlug: current.slug }}
            className="text-link text-sm underline-offset-4 hover:underline"
          >
            {t('seller.stock.back')}
          </Link>
          <header className="space-y-2">
            <h1
              tabIndex={-1}
              className="font-heading text-2xl font-semibold tracking-tight break-words outline-none md:text-3xl"
            >
              {t('seller.stock.history_heading', { sku: variant.sku })}
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                route="seller.products.edit"
                routeParams={{ shopSlug: current.slug, productId: variant.product.product_id }}
                className="text-link break-words underline-offset-4 hover:underline"
              >
                {variant.product.title}
              </Link>
              <span>{t('seller.stock.variant_of', { name })}</span>
              <StatusBadge entity="product" state={variant.product.status} />
              {variant.status === 'archived' && (
                <span className="text-muted-foreground rounded border px-1.5 text-xs">
                  {t('seller.stock.archived')}
                </span>
              )}
            </p>
          </header>
          <dl className="grid max-w-md grid-cols-3 gap-3 rounded-md border p-4 text-sm">
            <div>
              <dt className="text-muted-foreground">{t('seller.stock.column.on_hand')}</dt>
              <dd className="text-lg tabular-nums">{variant.on_hand}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('seller.stock.column.reserved')}</dt>
              <dd className="text-lg tabular-nums">{variant.reserved}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('seller.stock.column.available')}</dt>
              <dd className="text-lg font-medium tabular-nums">{variant.available}</dd>
            </div>
          </dl>
          {mayChange && (
            <div className="flex flex-wrap gap-3">
              <Button
                id={ACTION_IDS.adjust}
                type="button"
                variant="outline"
                className="h-11 text-base md:h-9 md:text-sm"
                onClick={() => openDialog('adjust')}
              >
                {t('seller.stock.adjust')}
              </Button>
              <Button
                id={ACTION_IDS.count}
                type="button"
                variant="outline"
                className="h-11 text-base md:h-9 md:text-sm"
                onClick={() => openDialog('count')}
              >
                {t('seller.stock.count')}
              </Button>
            </div>
          )}
        </div>

        <section aria-labelledby="stock-history-heading" className="space-y-3">
          <h2
            id="stock-history-heading"
            className="font-heading text-xl font-semibold tracking-tight"
          >
            {t('seller.stock.history_section')}
          </h2>
          {movements.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('seller.stock.no_history')}</p>
          ) : (
            <>
              <div
                role="region"
                aria-label={tableName}
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling table region is keyboard-focusable (docs/08 §6.3)
                tabIndex={0}
                className="hidden overflow-x-auto rounded-md border md:block"
              >
                <table className="w-full caption-bottom text-sm">
                  <caption className="sr-only">{tableName}</caption>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead scope="col">{t('seller.stock.column.when')}</TableHead>
                      <TableHead scope="col">{t('seller.stock.column.change')}</TableHead>
                      <TableHead scope="col" className="text-end">
                        {t('seller.stock.column.on_hand')}
                      </TableHead>
                      <TableHead scope="col" className="text-end">
                        {t('seller.stock.column.reserved')}
                      </TableHead>
                      <TableHead scope="col">{t('seller.stock.column.who')}</TableHead>
                      <TableHead scope="col">{t('seller.stock.column.note')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.items.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(movement.created_at)}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {movementWhat(movement)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          <Signed delta={movement.on_hand_delta} />
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          <Signed delta={movement.reserved_delta} />
                        </TableCell>
                        <TableCell>
                          {t(ACTOR_LABEL[movement.actor] ?? 'seller.stock.actor.system')}
                        </TableCell>
                        <TableCell className="max-w-64 whitespace-normal">
                          {movement.note && <p className="break-words">{movement.note}</p>}
                          {movement.request_id && (
                            <p className="text-muted-foreground font-mono text-xs break-all">
                              {t('seller.stock.request_id', { id: movement.request_id })}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </table>
              </div>
              <ul className="space-y-3 md:hidden" aria-label={tableName}>
                {movements.items.map((movement) => (
                  <li key={movement.id} className="space-y-2 rounded-md border p-4">
                    <p className="font-medium">{movementWhat(movement)}</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">{t('seller.stock.column.when')}</dt>
                      <dd>{formatDateTime(movement.created_at)}</dd>
                      <dt className="text-muted-foreground">{t('seller.stock.column.on_hand')}</dt>
                      <dd className="tabular-nums">
                        <Signed delta={movement.on_hand_delta} />
                      </dd>
                      <dt className="text-muted-foreground">{t('seller.stock.column.reserved')}</dt>
                      <dd className="tabular-nums">
                        <Signed delta={movement.reserved_delta} />
                      </dd>
                      <dt className="text-muted-foreground">{t('seller.stock.column.who')}</dt>
                      <dd>{t(ACTOR_LABEL[movement.actor] ?? 'seller.stock.actor.system')}</dd>
                      {movement.note && (
                        <>
                          <dt className="text-muted-foreground">{t('seller.stock.column.note')}</dt>
                          <dd className="break-words">{movement.note}</dd>
                        </>
                      )}
                    </dl>
                    {movement.request_id && (
                      <p className="text-muted-foreground font-mono text-xs break-all">
                        {t('seller.stock.request_id', { id: movement.request_id })}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {(next || onLaterPage) && (
            <nav className="flex gap-4" aria-label={t('seller.products.pages')}>
              {onLaterPage && (
                <Link
                  route="seller.inventory.history"
                  routeParams={{ shopSlug: current.slug, variantId: variant.variant_id }}
                  className="text-link underline-offset-4 hover:underline"
                >
                  {t('seller.stock.newest')}
                </Link>
              )}
              {next && (
                <Link
                  route="seller.inventory.history"
                  routeParams={{ shopSlug: current.slug, variantId: variant.variant_id }}
                  qs={{ cursor: next }}
                  className="text-link underline-offset-4 hover:underline"
                >
                  {t('seller.stock.older')}
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
      {dialog === 'adjust' && <AdjustStockDialog key={turn} {...dialogProps} />}
      {dialog === 'count' && <CountStockDialog key={turn} {...dialogProps} />}
    </>
  )
}
