import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { STOCK_LIMITS } from '@shared/constants/limits'
import {
  adjustBody,
  belowReservedCopy,
  belowReservedOf,
  emptyAdjust,
  quantityProblem,
  REASONS_FOR,
  reasonFor,
  stockChangedOf,
  type AdjustValues,
  type BelowReserved,
  type QuantityProblem,
  type StockDirection,
} from '@shared/ui/stock'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useIntentKey } from '~/hooks/use_intent_key'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { TextField } from '~/components/forms/text_field'
import { ChoiceField } from '~/components/forms/choice_field'
import { TextareaField } from '~/components/forms/textarea_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'

/*
 * The stock page's two changes (docs/08 §2.5 `/inventory`, §7.1, §7.3; 02
 * J-11 steps 2 and 3; R1-S part 2f-iv-a), each a form dialog opened from a
 * variant's actions menu.
 *
 * - "Adjust stock" sends `adjustInventory` ⚷: a direction, a quantity, a
 *   reason that fits the direction (`REASONS_FOR`) and an optional note.
 * - "Count stock" sends `stocktakeInventory` ⚷ with the counted quantity
 *   and `expected_on_hand`, the on-hand number the dialog showed. If the
 *   stock changed meanwhile (409 `stock_changed`), the dialog shows the new
 *   number, which the next save expects, and keeps the count typed.
 *
 * A change that would leave less stock than is reserved (409
 * `below_reserved`) keeps the dialog open and says why in 05 §8.13's
 * words: the number it would have set, and the reserved units, those for
 * open orders with their numbers (their pages come with the orders part)
 * and those held for a payment in progress. A 409 or a timeout tells the
 * page its numbers may be stale (`onStale`), so it reads them again. Each
 * dialog makes one `Idempotency-Key` per intent, so a retry of the same
 * values replays (06 §7.1); a timeout keeps the values and the key. The
 * note is kept permanently (08 §7.1 "Permanent notes"). A stray click
 * outside never discards what was typed. The page mounts a dialog per
 * opening (a `key`), so each starts empty.
 */
export type StockVariant = {
  variant_id: string
  sku: string
  label: string
  on_hand: number
  reserved: number
}

type AdjustBody = Route.Body<'adjustInventory'>
type CountBody = Route.Body<'stocktakeInventory'>

const QUANTITY_MESSAGES: Record<QuantityProblem, Parameters<typeof t>[0]> = {
  required: 'seller.stock.quantity_required',
  invalid: 'seller.stock.quantity_invalid',
  too_small: 'seller.stock.quantity_too_small',
  too_large: 'seller.stock.quantity_too_large',
}

export const REASON_LABEL: Record<string, Parameters<typeof t>[0]> = {
  received_stock: 'seller.stock.reason.received_stock',
  damaged: 'seller.stock.reason.damaged',
  lost: 'seller.stock.reason.lost',
  found: 'seller.stock.reason.found',
  sold_offline: 'seller.stock.reason.sold_offline',
  data_entry_error: 'seller.stock.reason.data_entry_error',
}

const quantityMessage = (text: string, min: number) => {
  const problem = quantityProblem(text, min)
  return problem ? t(QUANTITY_MESSAGES[problem], { min }) : undefined
}

const REFUSAL_COPY: Record<ReturnType<typeof belowReservedCopy>['key'], Parameters<typeof t>[0]> = {
  below_zero: 'seller.stock.below_zero',
  reserved_for_orders: 'seller.stock.reserved_for_orders',
  reserved_for_payment: 'seller.stock.reserved_for_payment',
  reserved_split: 'seller.stock.reserved_split',
}

// Why the change was refused, in 05 §8.13's words, from the number it would have set.
function BelowReservedNotice({ refusal, target }: { refusal: BelowReserved; target: number }) {
  const copy = belowReservedCopy(refusal, target)
  return (
    <Alert role="alert" variant="destructive">
      <AlertDescription>{t(REFUSAL_COPY[copy.key], copy.values)}</AlertDescription>
    </Alert>
  )
}

type DialogProps = {
  shopSlug: string
  variant: StockVariant
  open: boolean
  onOpenChange: (open: boolean) => void
  // A saved change: the variant's new on-hand number, for the page's toast and focus.
  onSaved: (variant: StockVariant, onHand: number) => void
  // The page's numbers may be stale (a 409, or a timeout that may have saved): read them again.
  onStale: () => void
  onCloseAutoFocus: (event: Event) => void
}

// A failure that tells the page its data is stale: the variant left, or the shop's status changed.
function reloadFor(problem: Problem) {
  if (problem.code === 'NOT_FOUND') router.reload({ only: ['inventory'] })
  if (problem.code === 'SHOP_NOT_ACTIVE') router.reload()
}

const ADJUST_FIELDS = [
  { name: 'direction', id: 'adjust-direction' },
  { name: 'quantity', id: 'adjust-quantity' },
  { name: 'reason', id: 'adjust-reason' },
  { name: 'note', id: 'adjust-note' },
] as const
const ADJUST_KNOWN = new Set(ADJUST_FIELDS.map((field) => field.name))
// The server's member names that the form names otherwise.
const ADJUST_FIELD_OF: Record<string, string> = { delta: 'quantity', reason_code: 'reason' }
const ADJUST_RATE_LIMIT_ID = 'adjust-rate-limit'

export function AdjustStockDialog({
  shopSlug,
  variant,
  open,
  onOpenChange,
  onSaved,
  onStale,
  onCloseAutoFocus,
}: DialogProps) {
  const mutation = useApiMutation()
  const intentKey = useIntentKey<{ variant: string; body: AdjustBody }>()
  const report = useErrorReport(ADJUST_FIELDS)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [refusal, setRefusal] = useState<{ found: BelowReserved; target: number } | null>(null)

  const form = useForm({
    defaultValues: emptyAdjust() as AdjustValues,
    canSubmitWhenInvalid: true,
    onSubmitInvalid: ({ formApi }) => {
      resetMessages()
      report.failed(formApi)
    },
    onSubmit: async ({ value, formApi }) => {
      resetMessages()
      report.clear()
      const body = adjustBody(value) satisfies AdjustBody
      const key = intentKey.for({ variant: variant.variant_id, body })
      const outcome = await mutation.run(() =>
        client.request('adjustInventory', {
          params: { shopSlug, variantId: variant.variant_id },
          body,
          headers: { 'Idempotency-Key': key },
          timeout: 30_000,
        })
      )
      if (!outcome) return
      if (outcome.ok) {
        onSaved(variant, outcome.data.data.on_hand)
        onOpenChange(false)
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        onStale()
        return
      }
      const found = outcome.problem
      // useApiMutation shows the wait next to the button.
      if (found.code === 'RATE_LIMITED') return
      const below = belowReservedOf(found)
      if (below) {
        setRefusal({ found: below, target: below.onHand + body.delta })
        onStale()
        return
      }
      if (found.errors?.length) {
        const placed: Problem = {
          ...found,
          errors: found.errors.map((item) => ({
            ...item,
            field: item.field ? (ADJUST_FIELD_OF[item.field] ?? item.field) : item.field,
          })),
        }
        report.failed(formApi, applyServerErrors(formApi, placed, ADJUST_KNOWN))
        return
      }
      setProblem(found)
      reloadFor(found)
    },
  })

  function resetMessages() {
    setProblem(null)
    setOffline(false)
    setRefusal(null)
  }

  function requestClose() {
    // Never mid-request; after a timeout the change may be saved, so the key stays for a replay.
    if (mutation.pending) return
    onOpenChange(false)
  }

  const blocked = mutation.pending || mutation.retryIn > 0

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{t('seller.stock.adjust_title', { sku: variant.sku })}</DialogTitle>
          <DialogDescription>
            {t('seller.stock.adjust_description', {
              label: variant.label,
              on_hand: variant.on_hand,
              reserved: variant.reserved,
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <ErrorSummary form={form} summary={report.summary} summaryRef={report.summaryRef} />
          <form.Field name="direction">
            {(field) => (
              <ChoiceField
                id="adjust-direction"
                label={t('seller.stock.direction')}
                value={field.state.value}
                options={[
                  { value: 'add', label: t('seller.stock.direction_add') },
                  { value: 'remove', label: t('seller.stock.direction_remove') },
                ]}
                errors={field.state.meta.errors}
                onChange={(next: StockDirection) => {
                  field.handleChange(next)
                  // A reason that does not fit the new direction is cleared.
                  form.setFieldValue('reason', reasonFor(next, form.getFieldValue('reason')))
                }}
              />
            )}
          </form.Field>
          <form.Field
            name="quantity"
            validators={{
              onBlur: ({ value }) => quantityMessage(value, 1),
              onSubmit: ({ value }) => quantityMessage(value, 1),
            }}
          >
            {(field) => (
              <TextField
                id="adjust-quantity"
                label={t('seller.stock.quantity')}
                inputMode="numeric"
                autoComplete="off"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => changeAndRecheck(field, value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.direction}>
            {(direction) => (
              <form.Field
                name="reason"
                validators={{
                  onSubmit: ({ value }) =>
                    value === '' ? t('seller.stock.reason_required') : undefined,
                }}
              >
                {(field) => (
                  <ChoiceField
                    id="adjust-reason"
                    label={t('seller.stock.reason_label')}
                    placeholder={t('seller.stock.reason_placeholder')}
                    value={field.state.value}
                    options={REASONS_FOR[direction].map((reason) => ({
                      value: reason,
                      label: t(REASON_LABEL[reason]),
                    }))}
                    errors={field.state.meta.errors}
                    onChange={(value) => field.handleChange(value)}
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>
          <form.Field name="note">
            {(field) => (
              <TextareaField
                id="adjust-note"
                label={t('seller.stock.note')}
                description={t('common.form.permanent_note')}
                maxLength={STOCK_LIMITS.note.max}
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => changeAndRecheck(field, value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          {refusal && <BelowReservedNotice refusal={refusal.found} target={refusal.target} />}
          <ProblemAlert problem={problem} offline={offline} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>
              {t('common.form.cancel')}
            </Button>
            <Button
              type="submit"
              aria-disabled={blocked || undefined}
              aria-describedby={mutation.retryIn > 0 ? ADJUST_RATE_LIMIT_ID : undefined}
              className={PENDING_BUTTON}
            >
              {mutation.pending ? t('seller.stock.saving') : t('seller.stock.adjust_submit')}
            </Button>
          </DialogFooter>
          <RateLimitNotice id={ADJUST_RATE_LIMIT_ID} seconds={mutation.retryIn} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

const COUNT_FIELDS = [{ name: 'counted', id: 'count-quantity' }] as const
const COUNT_KNOWN = new Set(COUNT_FIELDS.map((field) => field.name))
const COUNT_RATE_LIMIT_ID = 'count-rate-limit'

export function CountStockDialog({
  shopSlug,
  variant,
  open,
  onOpenChange,
  onSaved,
  onStale,
  onCloseAutoFocus,
}: DialogProps) {
  const mutation = useApiMutation()
  const intentKey = useIntentKey<{ variant: string; body: CountBody }>()
  const report = useErrorReport(COUNT_FIELDS)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [refusal, setRefusal] = useState<{ found: BelowReserved; target: number } | null>(null)
  // The on-hand number the count is checked against: as shown, or as a refusal said it is now.
  const [expected, setExpected] = useState(variant.on_hand)
  const [changed, setChanged] = useState(false)

  const form = useForm({
    defaultValues: { counted: '' },
    canSubmitWhenInvalid: true,
    onSubmitInvalid: ({ formApi }) => {
      resetMessages()
      report.failed(formApi)
    },
    onSubmit: async ({ value, formApi }) => {
      resetMessages()
      report.clear()
      const body = {
        counted_quantity: Number(value.counted.trim()),
        expected_on_hand: expected,
      } satisfies CountBody
      const key = intentKey.for({ variant: variant.variant_id, body })
      const outcome = await mutation.run(() =>
        client.request('stocktakeInventory', {
          params: { shopSlug, variantId: variant.variant_id },
          body,
          headers: { 'Idempotency-Key': key },
          timeout: 30_000,
        })
      )
      if (!outcome) return
      if (outcome.ok) {
        onSaved(variant, outcome.data.data.on_hand)
        onOpenChange(false)
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        onStale()
        return
      }
      const found = outcome.problem
      if (found.code === 'RATE_LIMITED') return
      const now = stockChangedOf(found)
      if (now) {
        setExpected(now.onHand)
        setChanged(true)
        onStale()
        return
      }
      const below = belowReservedOf(found)
      if (below) {
        setRefusal({ found: below, target: body.counted_quantity })
        onStale()
        return
      }
      if (found.errors?.length) {
        const placed: Problem = {
          ...found,
          errors: found.errors.map((item) => ({
            ...item,
            field: item.field === 'counted_quantity' ? 'counted' : item.field,
          })),
        }
        report.failed(formApi, applyServerErrors(formApi, placed, COUNT_KNOWN))
        return
      }
      setProblem(found)
      reloadFor(found)
    },
  })

  function resetMessages() {
    setProblem(null)
    setOffline(false)
    setRefusal(null)
    setChanged(false)
  }

  function requestClose() {
    if (mutation.pending) return
    onOpenChange(false)
  }

  const blocked = mutation.pending || mutation.retryIn > 0

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{t('seller.stock.count_title', { sku: variant.sku })}</DialogTitle>
          <DialogDescription>
            {t('seller.stock.count_description', { label: variant.label })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <ErrorSummary form={form} summary={report.summary} summaryRef={report.summaryRef} />
          <p className="text-sm">{t('seller.stock.count_expected', { on_hand: expected })}</p>
          {changed && (
            <Alert role="alert">
              <AlertDescription>
                {t('seller.stock.count_changed', { on_hand: expected })}
              </AlertDescription>
            </Alert>
          )}
          <form.Field
            name="counted"
            validators={{
              onBlur: ({ value }) => quantityMessage(value, 0),
              onSubmit: ({ value }) => quantityMessage(value, 0),
            }}
          >
            {(field) => (
              <TextField
                id="count-quantity"
                label={t('seller.stock.counted')}
                description={t('seller.stock.counted_help')}
                inputMode="numeric"
                autoComplete="off"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => changeAndRecheck(field, value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          {refusal && <BelowReservedNotice refusal={refusal.found} target={refusal.target} />}
          <ProblemAlert problem={problem} offline={offline} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>
              {t('common.form.cancel')}
            </Button>
            <Button
              type="submit"
              aria-disabled={blocked || undefined}
              aria-describedby={mutation.retryIn > 0 ? COUNT_RATE_LIMIT_ID : undefined}
              className={PENDING_BUTTON}
            >
              {mutation.pending ? t('seller.stock.saving') : t('seller.stock.count_submit')}
            </Button>
          </DialogFooter>
          <RateLimitNotice id={COUNT_RATE_LIMIT_ID} seconds={mutation.retryIn} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
