import { useEffect, useRef, useState } from 'react'
import { useForm, useStore, type AnyFormApi } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { VARIANT_LIMITS } from '@shared/constants/limits'
import { formatNPR, parseRupeesToMinor } from '@shared/format/money'
import {
  LIVE_PRODUCT_STATUSES,
  type AttributeOption,
  type CategoryOption,
  type SellerProduct,
} from '@shared/ui/product_details'
import {
  axesLocked,
  axisOptionsFor,
  buildRows,
  compareAtProblem,
  offeredAxisValues,
  optionKey,
  orderedAxes,
  priceProblem,
  sameAsSaved,
  setProblem,
  skuProblem,
  variantConflictFields,
  variantFieldOf,
  variantsBody,
  variantValuesFrom,
  weightProblem,
  type RowProblem,
  type SetProblem,
  type VariantRow,
  type VariantValues,
} from '@shared/ui/product_variants'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { CheckboxGroupField } from '~/components/forms/checkbox_group_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { MoneyInput } from '~/components/forms/money_input'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'

/*
 * The variant editor of `/seller/{shopSlug}/products/{productId}` (docs/08
 * §2.5, §7.1; 02 J-10 step 4; 01 FR-CAT-004; R1-S part 2f-ii): the options
 * the product varies by (at most two of its category's, the required ones
 * marked), the values of each, and one row per combination with its SKU,
 * price, earlier price and weight; a product without options has one row,
 * its default variant. Rows keep the existing variant of their combination
 * and what was typed in them while the options change
 * (shared/ui/product_variants.ts). Choosing an archived variant's options
 * makes it active again; a combination left out is deleted, or archived
 * when it has been stocked or sold.
 *
 * Save sends the whole set to `replaceProductVariants` ⟳ with `If-Match` of
 * the product as last known, and nothing when it matches the saved set.
 * After a save the form restarts from the 200's product and the props are
 * read again. A 412 keeps every value, lists what was saved differently
 * (the options, the variants), and offers "Keep my changes" and "Discard
 * mine and reload", as the details form does. Once a variant has
 * been stocked or sold the options are fixed (04a §7.8); values can still be
 * added or removed. A 422 lands on its row by the order sent, an options
 * problem on the options, anything else in the error summary.
 */
type Body = Route.Body<'replaceProductVariants'>

const RATE_LIMIT_ID = 'variants-rate-limit'
const AXES_ID = 'variants-axes'
const valuesId = (axis: string) => `variants-values-${axis}`
const rowId = (index: number, member: string) => `variant-${index}-${member}`

const ROW_MESSAGES: Record<RowProblem, Parameters<typeof t>[0]> = {
  sku_required: 'seller.product.variants.sku_required',
  sku_invalid: 'seller.product.variants.sku_invalid',
  sku_duplicate: 'seller.product.variants.sku_duplicate',
  price_required: 'seller.product.variants.price_required',
  price_invalid: 'seller.product.variants.price_invalid',
  price_positive: 'seller.product.variants.price_positive',
  compare_at_invalid: 'seller.product.variants.compare_at_invalid',
  compare_at_not_above: 'seller.product.variants.compare_at_not_above',
  weight_invalid: 'seller.product.variants.weight_invalid',
}

const SET_MESSAGES: Record<SetProblem, Parameters<typeof t>[0]> = {
  too_many: 'seller.product.variants.too_many',
  no_rows: 'seller.product.variants.no_rows',
  required_axis: 'seller.product.variants.required_axis',
  no_values: 'seller.product.variants.no_values',
}

// What a 412 changed, as the panel lists it.
const CONFLICT_LABELS = {
  options: 'seller.product.variants.conflict_options',
  variants: 'seller.product.variants.conflict_variants',
} as const

const rowMessage = (problem: RowProblem | null) =>
  problem
    ? t(ROW_MESSAGES[problem], {
        max: VARIANT_LIMITS.sku.max,
        max_price: formatNPR(VARIANT_LIMITS.priceMinor.max),
        min_weight: VARIANT_LIMITS.weightGrams.min,
        max_weight: VARIANT_LIMITS.weightGrams.max,
      })
    : undefined

// The 412's `current`, when it is a product; anything else reads as "reload".
function conflictProduct(problem: Problem): SellerProduct | null {
  const current = problem.current
  return typeof current === 'object' && current !== null && 'version' in current
    ? (current as SellerProduct)
    : null
}

export function ProductVariantsForm({
  shopSlug,
  product,
  categories,
  attributes,
  onSaved,
}: {
  shopSlug: string
  product: SellerProduct
  categories: CategoryOption[]
  attributes: AttributeOption[]
  // Tells the page the product as now saved, so the details form builds on it too.
  onSaved?: (next: SellerProduct) => void
}) {
  const mutation = useApiMutation()
  const [problem, showProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [done, setDone] = useState<'saved' | 'unchanged' | null>(null)
  const [conflict, setConflict] = useState<SellerProduct | null>(null)
  const [latest, setLatest] = useState<SellerProduct | null>(null)
  const [reloading, setReloading] = useState(false)
  const [fillPrice, setFillPrice] = useState('')
  const [fillError, setFillError] = useState<string | null>(null)
  const conflictRef = useRef<HTMLDivElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const hadConflict = useRef(false)
  // The newest product known: the props, or what a save or discard returned before they caught up.
  const base = latest && latest.version > product.version ? latest : product
  const live = LIVE_PRODUCT_STATUSES.includes(base.status)
  const category = categories.find((candidate) => candidate.id === base.category.id)
  const options = axisOptionsFor(category, attributes, base)
  const locked = axesLocked(base)

  // A 412 swaps the save button for the conflict panel and back; focus follows (08 §7.1, §9).
  useEffect(() => {
    if (conflict) {
      hadConflict.current = true
      conflictRef.current?.focus()
    } else if (hadConflict.current) {
      hadConflict.current = false
      saveRef.current?.focus()
    }
  }, [conflict])

  function resetMessages() {
    showProblem(null)
    setOffline(false)
    setDone(null)
  }

  // Restarts the form from `next`, the product as now saved, then reads the props again.
  function restartFrom(formApi: { reset: (values: VariantValues) => void }, next: SellerProduct) {
    setLatest(next)
    onSaved?.(next)
    setConflict(null)
    formApi.reset(variantValuesFrom(next, attributes))
    setReloading(true)
    router.reload({
      only: ['product'],
      onSuccess: (page) => {
        const fresh = page.props.product as SellerProduct
        if (fresh.version !== next.version) formApi.reset(variantValuesFrom(fresh, attributes))
      },
      onFinish: () => setReloading(false),
    })
  }

  const form = useForm({
    defaultValues: variantValuesFrom(base, attributes),
    // Submit re-runs every validator on the current values (docs/09 §13.5).
    canSubmitWhenInvalid: true,
    onSubmitInvalid: ({ formApi }) => {
      resetMessages()
      report.failed(formApi)
    },
    onSubmit: async ({ value, formApi }) => {
      if (mutation.pending || reloading) return
      resetMessages()
      report.clear()
      // The route's own type checks that the shared body is what the server takes.
      const body = variantsBody(value) satisfies Body
      if (sameAsSaved(body, base)) {
        // Nothing of the user's is left to keep after a 412: the form catches up instead.
        if (conflict) restartFrom(formApi, conflict)
        else setDone('unchanged')
        return
      }
      // After a 412, "Keep my changes" sends the same set on the version now saved.
      const version = conflict?.version ?? base.version
      const outcome = await mutation.run(() =>
        client.request('replaceProductVariants', {
          params: { shopSlug, productId: base.id },
          body,
          headers: { 'If-Match': `"${version}"` },
          timeout: 30_000,
        })
      )
      if (!outcome) return
      if (outcome.ok) {
        setDone('saved')
        restartFrom(formApi, outcome.data.data)
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        return
      }
      const found = outcome.problem
      // useApiMutation shows the wait next to the button.
      if (found.code === 'RATE_LIMITED') return
      if (found.code === 'VERSION_CONFLICT') {
        const current = conflictProduct(found)
        if (current) setConflict(current)
        else showProblem(found)
        return
      }
      // Suspended, or the product moved to a status that cannot be edited: the page says why.
      if (found.code === 'SHOP_NOT_ACTIVE' || found.code === 'INVALID_STATE_TRANSITION') {
        showProblem(found)
        router.reload()
        return
      }
      if (found.errors?.length) {
        failed(formApi, found, value.rows)
      } else {
        showProblem(found)
      }
    },
  })

  /*
   * A 422: each item on its row or the options, by the order sent; the rest in
   * the summary, named with its row when it is about one (a combination, a
   * variant listed twice).
   */
  function failed(formApi: AnyFormApi, found: Problem, sent: readonly VariantRow[]) {
    const placed: Problem = {
      ...found,
      errors: (found.errors ?? []).map((item) => {
        const field = variantFieldOf(item.field, sent.length)
        const index = /^variants\.(\d+)\./.exec(item.field ?? '')?.[1]
        const row = index === undefined ? undefined : sent[Number(index)]
        return field === null && row
          ? {
              ...item,
              field,
              message: t('seller.product.variants.row_problem', {
                variant: labelOf(row),
                message: item.message,
              }),
            }
          : { ...item, field }
      }),
    }
    report.failed(formApi, applyServerErrors(formApi, placed, known))
  }

  // Read from the store, which re-renders on every change: the grid sets these as a whole.
  const axes = useStore(form.store, (state) => state.values.axes)
  const chosenValues = useStore(form.store, (state) => state.values.values)
  const rows = useStore(form.store, (state) => state.values.rows)
  const summaryFields = [
    { name: 'axes', id: AXES_ID },
    ...axes.map((axis) => ({ name: `values.${axis}`, id: valuesId(axis) })),
    ...rows.flatMap((_row, index) =>
      (['sku', 'price', 'compareAt', 'weight'] as const).map((member) => ({
        name: `rows[${index}].${member}`,
        id: rowId(index, member),
      }))
    ),
  ]
  const known = new Set(summaryFields.map((field) => field.name))
  const report = useErrorReport(summaryFields)
  const blocked = mutation.pending || reloading || mutation.retryIn > 0
  const conflictFields = conflict ? variantConflictFields(base, conflict) : []

  // The grid follows the options and values; rows keep what was typed, and lose stale messages.
  function regrid(nextAxes: string[], nextValues: Record<string, string[]>) {
    const ordered = orderedAxes(nextAxes, base)
    const current = form.getFieldValue('rows')
    const next = buildRows(base, ordered, nextValues, attributes, current)
    // Read before the values change: setting a field drops its submit message.
    const showing = ['axes' as const, ...ordered.map((axis) => `values.${axis}` as const)].filter(
      (name) => form.getFieldMeta(name)?.errorMap.onSubmit
    )
    form.setFieldValue('axes', ordered, { dontValidate: true })
    form.setFieldValue('values', nextValues, { dontValidate: true })
    form.setFieldValue('rows', next, { dontValidate: true })
    for (let index = 0; index < Math.max(current.length, next.length); index++) {
      for (const member of ['sku', 'price', 'compareAt', 'weight'] as const) {
        const name = `rows[${index}].${member}` as const
        if (form.getFieldMeta(name)) form.setFieldMeta(name, (prev) => ({ ...prev, errorMap: {} }))
      }
    }
    // Once the options or a value group show a message, it follows each change.
    for (const name of showing) void form.validateField(name, 'submit')
  }

  function discardAndReload() {
    if (mutation.pending || reloading || !conflict) return
    resetMessages()
    report.clear()
    restartFrom(form, conflict)
  }

  function fillAll() {
    const minor = parseRupeesToMinor(fillPrice)
    if (minor === null || minor > VARIANT_LIMITS.priceMinor.max) {
      setFillError(rowMessage('price_invalid') ?? null)
      return
    }
    setFillError(null)
    form.getFieldValue('rows').forEach((_row, index) => {
      form.setFieldValue(`rows[${index}].price`, fillPrice.trim())
      for (const member of ['price', 'compareAt'] as const) {
        if (form.getFieldMeta(`rows[${index}].${member}`)?.errorMap.onBlur) {
          void form.validateField(`rows[${index}].${member}`, 'blur')
        }
      }
    })
  }

  const labelOf = (row: VariantRow) => {
    const codes = Object.entries(row.codes)
    if (codes.length === 0) return t('seller.product.variants.default')
    return codes
      .map(([axis, code]) => {
        const attribute = attributes.find((candidate) => candidate.code === axis)
        const value = attribute?.values.find((candidate) => candidate.code === code)
        return `${attribute?.name ?? axis}: ${value?.label ?? code}`
      })
      .join(' / ')
  }

  // Archived variants no row keeps: choosing their options brings them back.
  const rowKeys = new Set(rows.map((row) => row.key))
  const archivedAside = base.variants.filter(
    (variant) =>
      variant.status === 'archived' && !rowKeys.has(optionKey(variant.option_value_codes))
  )

  return (
    <form
      className="space-y-8"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <ErrorSummary form={form} summary={report.summary} summaryRef={report.summaryRef} />

      <FieldSet className="gap-5">
        <FieldLegend>{t('seller.product.variants.options_legend')}</FieldLegend>
        {options.length === 0 ? (
          <FieldDescription>{t('seller.product.variants.no_options')}</FieldDescription>
        ) : (
          <form.Field
            name="axes"
            // On submit only: a message shown on blur would move the values below as the
            // pointer reaches them, and swallow the click (08 §7.1).
            validators={{
              onSubmit: ({ value, fieldApi }) => {
                const problemCode = setProblem(
                  { ...fieldApi.form.state.values, axes: value },
                  options,
                  live
                )
                // A missing value shows on its value group, below.
                return problemCode && problemCode !== 'no_values'
                  ? t(SET_MESSAGES[problemCode], { max: VARIANT_LIMITS.variants.max })
                  : undefined
              },
            }}
          >
            {(field) => (
              <CheckboxGroupField
                id={AXES_ID}
                legend={t('seller.product.variants.options')}
                description={
                  locked
                    ? t('seller.product.variants.options_locked')
                    : t('seller.product.variants.options_help', { max: VARIANT_LIMITS.axes.max })
                }
                options={options.map((option) => ({
                  value: option.attribute.code,
                  label: option.required
                    ? t('seller.product.variants.option_required', { name: option.attribute.name })
                    : option.attribute.name,
                  disabled:
                    locked ||
                    (!axes.includes(option.attribute.code) &&
                      axes.length >= VARIANT_LIMITS.axes.max),
                }))}
                value={axes}
                errors={field.state.meta.errors}
                onChange={(next) => regrid(next, form.getFieldValue('values'))}
                // No blur check: a blur would drop the submit message while it is still true.
                onBlur={() => undefined}
              />
            )}
          </form.Field>
        )}
        {axes.map((axis) => {
          const attribute = attributes.find((candidate) => candidate.code === axis)
          if (!attribute) return null
          return (
            <form.Field
              key={axis}
              name={`values.${axis}`}
              validators={{
                // On submit only, as the options; the value is read from the form.
                onSubmit: ({ fieldApi }) =>
                  (fieldApi.form.getFieldValue('values')[axis] ?? []).length === 0
                    ? t(SET_MESSAGES.no_values)
                    : undefined,
              }}
            >
              {(field) => (
                <CheckboxGroupField
                  id={valuesId(axis)}
                  legend={t('seller.product.variants.values', { name: attribute.name })}
                  options={offeredAxisValues(attribute, base).map((value) => ({
                    value: value.code,
                    label: value.is_active
                      ? value.label
                      : t('seller.product.value_retired', { name: value.label }),
                  }))}
                  value={chosenValues[axis] ?? []}
                  errors={field.state.meta.errors}
                  onChange={(next) =>
                    regrid(form.getFieldValue('axes'), {
                      ...form.getFieldValue('values'),
                      [axis]: next,
                    })
                  }
                  // As the options: a blur would drop the submit message while it is still true.
                  onBlur={() => undefined}
                />
              )}
            </form.Field>
          )
        })}
      </FieldSet>

      <FieldSet className="gap-4">
        <FieldLegend>{t('seller.product.variants.grid_legend')}</FieldLegend>
        <FieldDescription>
          {live
            ? t('seller.product.variants.grid_help_live')
            : t('seller.product.variants.grid_help_draft')}
        </FieldDescription>
        {rows.length > 1 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="sm:w-56">
              <MoneyInput
                id="variants-fill-price"
                label={t('seller.product.variants.fill_price')}
                value={fillPrice}
                errors={fillError ? [fillError] : []}
                onChange={setFillPrice}
                onBlur={() => undefined}
                // Enter fills the rows; it never saves the variants at the old prices.
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  fillAll()
                }}
              />
            </div>
            <Button type="button" variant="outline" className="h-11 sm:mb-0" onClick={fillAll}>
              {t('seller.product.variants.fill_apply')}
            </Button>
          </div>
        )}
        {rows.length === 0 ? (
          <p className="text-muted-foreground">{t('seller.product.variants.choose_values')}</p>
        ) : (
          <div className="space-y-3">
            <div
              aria-hidden="true"
              className="text-muted-foreground hidden gap-3 px-3 text-sm font-medium lg:grid lg:grid-cols-[minmax(7rem,1fr)_minmax(8rem,1.3fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_minmax(4.5rem,0.6fr)_3.5rem]"
            >
              <span>{t('seller.product.variants.column.variant')}</span>
              <span>{t('seller.product.variants.column.sku')}</span>
              <span>{t('seller.product.variants.column.price')}</span>
              <span>{t('seller.product.variants.column.compare_at')}</span>
              <span>{t('seller.product.variants.column.weight')}</span>
              <span className="text-end">{t('seller.product.variants.column.on_hand')}</span>
            </div>
            <ul className="space-y-3">
              {rows.map((row, index) => (
                <li
                  key={row.key}
                  className="grid gap-3 rounded-md border p-3 lg:items-start lg:grid-cols-[minmax(7rem,1fr)_minmax(8rem,1.3fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_minmax(4.5rem,0.6fr)_3.5rem]"
                >
                  <div className="space-y-1">
                    <p id={rowId(index, 'label')} className="font-medium break-words">
                      {labelOf(row)}
                    </p>
                    {row.archived && (
                      <Badge variant="outline">{t('seller.product.variants.restoring')}</Badge>
                    )}
                    {row.hasHistory && !row.archived && (
                      <p className="text-muted-foreground text-xs">
                        {t('seller.product.variants.has_history')}
                      </p>
                    )}
                  </div>
                  <form.Field
                    name={`rows[${index}].sku`}
                    validators={{
                      onBlur: ({ value, fieldApi }) =>
                        rowMessage(skuProblem(value, fieldApi.form.getFieldValue('rows'), index)),
                    }}
                  >
                    {(field) => (
                      <RowField
                        id={rowId(index, 'sku')}
                        label={t('seller.product.variants.column.sku')}
                        describedBy={rowId(index, 'label')}
                        value={field.state.value}
                        errors={field.state.meta.errors}
                        onChange={(value) => changeAndRecheck(field, value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </form.Field>
                  <form.Field
                    name={`rows[${index}].price`}
                    validators={{ onBlur: ({ value }) => rowMessage(priceProblem(value, live)) }}
                    listeners={{
                      // The earlier price is checked against this one: a message there follows it.
                      onChange: () => {
                        if (form.getFieldMeta(`rows[${index}].compareAt`)?.errorMap.onBlur) {
                          void form.validateField(`rows[${index}].compareAt`, 'blur')
                        }
                      },
                    }}
                  >
                    {(field) => (
                      <MoneyInput
                        id={rowId(index, 'price')}
                        label={t('seller.product.variants.column.price')}
                        labelClassName="lg:sr-only"
                        describedBy={rowId(index, 'label')}
                        value={field.state.value}
                        errors={field.state.meta.errors}
                        onChange={(value) => changeAndRecheck(field, value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </form.Field>
                  <form.Field
                    name={`rows[${index}].compareAt`}
                    validators={{
                      onBlur: ({ value, fieldApi }) =>
                        rowMessage(
                          compareAtProblem(
                            value,
                            fieldApi.form.getFieldValue(`rows[${index}].price`)
                          )
                        ),
                    }}
                  >
                    {(field) => (
                      <MoneyInput
                        id={rowId(index, 'compareAt')}
                        label={t('seller.product.variants.column.compare_at')}
                        labelClassName="lg:sr-only"
                        describedBy={rowId(index, 'label')}
                        value={field.state.value}
                        errors={field.state.meta.errors}
                        onChange={(value) => changeAndRecheck(field, value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </form.Field>
                  <form.Field
                    name={`rows[${index}].weight`}
                    validators={{ onBlur: ({ value }) => rowMessage(weightProblem(value)) }}
                  >
                    {(field) => (
                      <RowField
                        id={rowId(index, 'weight')}
                        label={t('seller.product.variants.column.weight')}
                        describedBy={rowId(index, 'label')}
                        inputMode="numeric"
                        value={field.state.value}
                        errors={field.state.meta.errors}
                        onChange={(value) => changeAndRecheck(field, value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </form.Field>
                  <p className="text-sm tabular-nums lg:text-end lg:leading-9">
                    <span className="sr-only">
                      {t('seller.product.variants.on_hand_count', { count: row.onHand })}
                    </span>
                    <span aria-hidden="true" className="lg:hidden">
                      {t('seller.product.variants.on_hand_count', { count: row.onHand })}
                    </span>
                    <span aria-hidden="true" className="hidden lg:inline">
                      {row.onHand}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {archivedAside.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('seller.product.variants.archived_heading')}</p>
            <p className="text-muted-foreground text-sm">
              {t('seller.product.variants.archived_help')}
            </p>
            <ul className="ml-4 list-disc text-sm">
              {archivedAside.map((variant) => (
                <li key={variant.id}>
                  {t('seller.product.variants.archived_item', {
                    label: variant.label,
                    sku: variant.sku,
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </FieldSet>

      {conflict && (
        <Alert ref={conflictRef} tabIndex={-1} role="alert" className="outline-none">
          <AlertTitle>{t('seller.product.variants.conflict_title')}</AlertTitle>
          <AlertDescription>
            <p>{t('seller.product.variants.conflict_body')}</p>
            {conflictFields.length > 0 && (
              <>
                <p>{t('seller.product.conflict_fields')}</p>
                <ul className="ml-4 list-disc">
                  {conflictFields.map((name) => (
                    <li key={name}>{t(CONFLICT_LABELS[name])}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              {/* Submits the form, so the values are checked again before they are sent. */}
              <Button
                type="submit"
                className={`h-11 w-full text-base sm:w-auto ${PENDING_BUTTON}`}
                aria-disabled={blocked || undefined}
                aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
              >
                {t('seller.product.conflict_keep')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`h-11 w-full text-base sm:w-auto ${PENDING_BUTTON}`}
                aria-disabled={blocked || undefined}
                onClick={discardAndReload}
              >
                {t('seller.product.conflict_discard')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {done && (
        <Alert role="status">
          <AlertDescription>
            {done === 'saved'
              ? t('seller.product.variants.saved')
              : t('seller.product.variants.unchanged')}
          </AlertDescription>
        </Alert>
      )}
      <ProblemAlert problem={problem} offline={offline} entity="product" />
      {!conflict && (
        <div className="space-y-2">
          {/* aria-disabled, not disabled, while busy: it keeps focus (08 §7.1). */}
          <Button
            ref={saveRef}
            type="submit"
            className={`h-11 w-full text-base sm:w-auto ${PENDING_BUTTON}`}
            aria-disabled={blocked || undefined}
            aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
          >
            {mutation.pending || reloading
              ? t('seller.product.submitting')
              : t('seller.product.variants.submit')}
          </Button>
          <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
        </div>
      )}
      {conflict && <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />}
    </form>
  )
}

/*
 * A row's text input: its label names the column, visible on phones, where
 * each row is a card, and for screen readers only on wide screens, where the
 * column header shows it; `describedBy` adds the row's name.
 */
function RowField({
  id,
  label,
  describedBy,
  value,
  onChange,
  onBlur,
  errors,
  inputMode,
}: {
  id: string
  label: string
  describedBy: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  errors: unknown[]
  inputMode?: 'numeric'
}) {
  const messages = errors.filter((error): error is string => typeof error === 'string')
  const described = [describedBy, messages.length > 0 ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ')
  return (
    <Field data-invalid={messages.length > 0 || undefined}>
      <FieldLabel htmlFor={id} className="lg:sr-only">
        {label}
      </FieldLabel>
      <Input
        id={id}
        name={id}
        value={value}
        autoComplete="off"
        inputMode={inputMode}
        aria-invalid={messages.length > 0 || undefined}
        aria-describedby={described}
        className="h-11 text-base lg:h-9 lg:text-sm"
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      <FieldError id={`${id}-error`} errors={messages.map((message) => ({ message }))} />
    </Field>
  )
}
