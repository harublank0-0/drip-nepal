import { useRef } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import type { Problem } from '@shared/api/problem'
import type { SellerProduct } from '@shared/ui/product_details'
import { needsReview, type ProductMove } from '@shared/ui/product_status'
import { client } from '~/client'
import { t } from '~/lib/i18n'
import { PENDING_BUTTON } from '~/lib/forms'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { ConfirmDialog } from '~/components/common/confirm_dialog'

/*
 * The product status moves of the seller pages (docs/08 §2.5 `/products`
 * and `/products/{productId}` rows, §7.3; R1-S part 2f-iii): the buttons,
 * the archive confirmation and the request. Which moves a product offers
 * is `productMoves` (shared/ui/product_status.ts), the server's own list.
 * The editor shows them as buttons (`MoveButtons`); a list row puts them in
 * one menu button named with the row (`MoveMenu`, 08 §1.4, §7.2).
 *
 * Publishing, unpublishing and restoring are tier 0 (reversible: a toast
 * confirms, 08 §7.3). Archiving is tier 1: it takes the product out of the
 * shop and archives its variants, and a restore brings it back as a draft
 * whose variants the seller sets again, so `ArchiveDialog` states that
 * first. Its button is not `--destructive`, which is kept for what cannot
 * be undone (08 §1.4 "One colour for danger").
 */

const LABEL: Record<ProductMove, Parameters<typeof t>[0]> = {
  publish: 'seller.product.move.publish',
  unpublish: 'seller.product.move.unpublish',
  archive: 'seller.product.move.archive',
  restore: 'seller.product.move.restore',
}

const PENDING: Record<ProductMove, Parameters<typeof t>[0]> = {
  publish: 'seller.product.move.publishing',
  unpublish: 'seller.product.move.unpublishing',
  archive: 'seller.product.move.archiving',
  restore: 'seller.product.move.restoring',
}

export const MOVE_DONE: Record<ProductMove, Parameters<typeof t>[0]> = {
  publish: 'seller.product.move.published',
  unpublish: 'seller.product.move.unpublished',
  archive: 'seller.product.move.archived',
  restore: 'seller.product.move.restored',
}

// The request for `move`; each answers the product with its new version (06 §13.5).
export function sendMove(shopSlug: string, productId: string, move: ProductMove) {
  const request = { params: { shopSlug, productId }, timeout: 30_000 }
  const send = async (): Promise<{ data: SellerProduct }> => {
    switch (move) {
      case 'publish':
        return client.request('publishProduct', request)
      case 'unpublish':
        return client.request('unpublishProduct', request)
      case 'archive':
        return client.request('archiveProduct', request)
      case 'restore':
        return client.request('restoreProduct', request)
    }
  }
  return send
}

// A move's refusal as the page shows it: a draft that has to be reviewed first is told so.
export function moveProblemOf(problem: Problem): Problem {
  return needsReview(problem)
    ? { ...problem, detail: t('seller.product.move.needs_review') }
    : problem
}

/*
 * The editor's moves, one button each. A pressed move shows its pending
 * label; while `blocked`, a press does nothing and the buttons stay
 * focusable (`aria-disabled`, 08 §7.1 "One submit in flight") and name the
 * `RATE_LIMITED` wait's notice while it shows.
 */
export function MoveButtons({
  moves,
  idOf,
  pending,
  blocked,
  describedBy,
  onMove,
}: {
  moves: readonly ProductMove[]
  idOf: (move: ProductMove) => string
  pending: ProductMove | null
  blocked: boolean
  // The `RATE_LIMITED` wait's notice while it shows (08 §8.3), as the other blocked buttons have.
  describedBy?: string
  onMove: (move: ProductMove) => void
}) {
  return (
    <>
      {moves.map((move) => (
        <Button
          key={move}
          id={idOf(move)}
          type="button"
          variant={move === 'publish' ? 'default' : 'outline'}
          aria-disabled={blocked || undefined}
          aria-describedby={describedBy}
          className={cn('h-11 text-base md:h-9 md:text-sm', PENDING_BUTTON)}
          onClick={() => {
            if (!blocked) onMove(move)
          }}
        >
          {pending === move ? t(PENDING[move]) : t(LABEL[move])}
        </Button>
      ))}
    </>
  )
}

/*
 * A list row's moves: one menu button, "Actions for <title>", whose items
 * are the moves (08 §7.2 "Table markup and keyboard"). A choice runs once
 * the menu has closed and given focus back to its button, so the page's own
 * focus moves (the archive dialog, a refusal's alert, the heading) come
 * after it and are not undone. While a move of this row runs, the button
 * says so. While `blocked` the items are disabled; the button stays
 * focusable and names the `RATE_LIMITED` wait's notice while it shows.
 */
export function MoveMenu({
  moves,
  id,
  rowId,
  title,
  pending,
  blocked,
  describedBy,
  onMove,
}: {
  moves: readonly ProductMove[]
  id: string
  rowId: string
  title: string
  pending: ProductMove | null
  blocked: boolean
  describedBy?: string
  onMove: (move: ProductMove) => void
}) {
  const chosen = useRef<ProductMove | null>(null)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          data-move-row={rowId}
          type="button"
          variant="outline"
          aria-describedby={describedBy}
          className="h-11 text-base md:h-9 md:text-sm"
        >
          {pending ? t(PENDING[pending]) : t('seller.product.move.actions')}
          {/* "Actions for <title>", or "Publishing… <title>" while a move runs. */}
          <span className="sr-only">
            {' '}
            {pending ? title : t('seller.product.move.actions_for', { title })}
          </span>
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={() => {
          // The default still returns focus to the button first; then the move runs.
          const move = chosen.current
          chosen.current = null
          if (move) queueMicrotask(() => onMove(move))
        }}
      >
        {moves.map((move) => (
          <DropdownMenuItem
            key={move}
            // Shown as unavailable while another move runs or the wait lasts.
            disabled={blocked}
            onSelect={() => {
              if (!blocked) chosen.current = move
            }}
          >
            {t(LABEL[move])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/*
 * The tier 1 confirmation before archiving (08 §7.3). Opened from the
 * editor's Archive button or a list row's menu item, not its own trigger,
 * so the caller says where focus goes on close (rule 1).
 */
export function ArchiveDialog({
  title,
  open,
  onOpenChange,
  pending,
  retryIn,
  onConfirm,
  onCloseAutoFocus,
}: {
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  retryIn: number
  onConfirm: () => void
  onCloseAutoFocus: (event: Event) => void
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('seller.product.move.archive_title', { title })}
      consequence={t('seller.product.move.archive_consequence')}
      confirmLabel={t('seller.product.move.archive_confirm')}
      pendingLabel={t('seller.product.move.archiving')}
      destructive={false}
      pending={pending}
      retryIn={retryIn}
      onConfirm={onConfirm}
      onCloseAutoFocus={onCloseAutoFocus}
    />
  )
}
