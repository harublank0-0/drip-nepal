import { useEffect, useRef, useState } from 'react'
import { useForm, useStore, type AnyFormApi } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { PRODUCT_LIMITS } from '@shared/constants/limits'
import { COUNTRY_CODES } from '@shared/constants/countries'
import {
  changedFields,
  changedMembers,
  createBody,
  detailsFieldOf,
  detailsFrom,
  emptyDetails,
  LIVE_PRODUCT_STATUSES,
  NEPAL,
  offeredValues,
  productAttributesFor,
  type AttributeOption,
  type BrandOption,
  type CategoryOption,
  type DetailsField,
  type DetailsValues,
  type Origin,
  type SellerProduct,
} from '@shared/ui/product_details'
import { client, urlFor } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { useIntentKey } from '~/hooks/use_intent_key'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { FieldDescription, FieldLegend, FieldSet } from '~/components/ui/field'
import { TextField } from '~/components/forms/text_field'
import { TextareaField } from '~/components/forms/textarea_field'
import { ChoiceField } from '~/components/forms/choice_field'
import { ComboboxField } from '~/components/forms/combobox_field'
import { CheckboxGroupField } from '~/components/forms/checkbox_group_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'

/*
 * The product details form (docs/08 §2.5 `/products/new` and
 * `/products/{productId}`, §7.1; 01 FR-CAT-003, FR-CAT-007, FR-CAT-008,
 * FR-CAT-012; R1-S part 2f-i): the title, the leaf category, the brand or
 * the shop's own label, the category's product attributes, the
 * description, and the listing disclosures of E-Commerce Act 2081 s6 (the
 * producer, made in Nepal or imported and from where, the warranty, care
 * and precautions). Variants, stock and photos have their own sections.
 *
 * - Without `product`, "Save draft" calls `createProduct` ⚷ with one
 *   `Idempotency-Key` per intent (a retry of the same values replays), and
 *   opens the editor of the new draft (02 J-10 step 3).
 * - With `product`, "Save details" sends only the members that differ from
 *   the product as last known (`base`: the page's prop, or the newer product
 *   a save or a 412 returned) to `updateProduct` ⟳ with `If-Match:
 *   "<version>"`, and nothing when none does. After a save the form restarts
 *   from the 200's product and the props are read again (docs/09 §13.3 rule
 *   3). A 412 keeps every value typed and lists the fields saved
 *   differently meanwhile, with "Keep my changes" and "Discard mine and
 *   reload" (08 §7.1 "Concurrent edits"), as the shop settings form does.
 *
 * The category decides which attributes the form shows (its effective
 * rules with usage `product`); values chosen under another category stay in
 * the form but are not sent. A draft may leave the disclosures empty: each
 * says it is needed before the product can go live. A live product
 * (`published`, `unpublished`) must keep them, so there they are required
 * (04a §7.6 `products_disclosures_check`). Client rules mirror the server's
 * (`PRODUCT_LIMITS`) and run on blur and submit; a 422 lands on its field
 * (an attribute item by its index in the body sent), anything else in the
 * error summary or above the button with its reference.
 */
type CreateBody = Route.Body<'createProduct'>
type UpdateBody = Route.Body<'updateProduct'>

// The single-value choice that leaves an attribute unset (a Radix select item cannot be empty).
const NOT_SET = '__not_set__'
// The brand choice of the shop's own label.
const OWN_LABEL = '__own_label__'

const RATE_LIMIT_ID = 'product-rate-limit'
const TALL = 'data-[size=default]:h-11 text-base md:text-sm'

const { title: titleLimit } = PRODUCT_LIMITS

// Each field's input id, for the error summary and focus (docs/08 §7.1).
const FIELD_IDS: Record<Exclude<DetailsField, 'attributes'>, string> = {
  title: 'product-title',
  category_id: 'product-category',
  brand_id: 'product-brand',
  description: 'product-description',
  manufacturer_name: 'product-manufacturer',
  origin: 'product-origin',
  country_of_origin: 'product-country',
  warranty_text: 'product-warranty',
  care_and_precautions: 'product-care',
}

// Each field's label, also used to list what changed after a 412.
const LABELS: Record<DetailsField, Parameters<typeof t>[0]> = {
  title: 'seller.product.title',
  category_id: 'seller.product.category',
  brand_id: 'seller.product.brand',
  attributes: 'seller.product.attributes',
  description: 'seller.product.description',
  manufacturer_name: 'seller.product.manufacturer_name',
  origin: 'seller.product.origin',
  country_of_origin: 'seller.product.country_of_origin',
  warranty_text: 'seller.product.warranty_text',
  care_and_precautions: 'seller.product.care_and_precautions',
}

const attributeId = (code: string) => `product-attribute-${code}`

// Code points after NFC, as the server counts them (docs/04 §2.8).
const codePoints = (value: string) => [...value.trim().normalize('NFC')].length

function countryOptions() {
  const names = new Intl.DisplayNames(['en'], { type: 'region' })
  return COUNTRY_CODES.filter((code) => code !== NEPAL)
    .map((code) => ({ value: code, label: names.of(code) ?? code }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en'))
}

// The 412's `current`, when it is a product; anything else reads as "reload".
function conflictProduct(problem: Problem): SellerProduct | null {
  const current = problem.current
  return typeof current === 'object' && current !== null && 'version' in current
    ? (current as SellerProduct)
    : null
}

// The status line after each outcome of an edit.
const DONE_MESSAGES = {
  saved: 'seller.product.saved',
  unchanged: 'seller.product.unchanged',
} as const

export function ProductDetailsForm({
  shopSlug,
  product,
  categories,
  attributes,
  brands,
}: {
  shopSlug: string
  product: SellerProduct | null
  categories: CategoryOption[]
  attributes: AttributeOption[]
  brands: BrandOption[]
}) {
  const mutation = useApiMutation()
  const intentKey = useIntentKey<CreateBody>()
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [done, setDone] = useState<'saved' | 'unchanged' | null>(null)
  // The product as saved now, after a 412; null otherwise.
  const [conflict, setConflict] = useState<SellerProduct | null>(null)
  // The product a save returned or a discard adopted, until the props catch up with it.
  const [latest, setLatest] = useState<SellerProduct | null>(null)
  // While the props are read again after a save or a discard, or the editor opens after a create.
  const [reloading, setReloading] = useState(false)
  const conflictRef = useRef<HTMLDivElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const hadConflict = useRef(false)
  const [countries] = useState(countryOptions)
  // The newest product known: the props, or what a save or discard returned before they caught up.
  const base = product && latest && latest.version > product.version ? latest : product
  const live = base !== null && LIVE_PRODUCT_STATUSES.includes(base.status)

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
    setProblem(null)
    setOffline(false)
    setDone(null)
  }

  // Restarts the form from `next`, the product as now saved, then reads the props again.
  function restartFrom(formApi: { reset: (values: DetailsValues) => void }, next: SellerProduct) {
    setLatest(next)
    setConflict(null)
    formApi.reset(detailsFrom(next))
    setReloading(true)
    router.reload({
      only: ['product'],
      onSuccess: (page) => {
        const fresh = page.props.product as SellerProduct
        if (fresh.version !== next.version) formApi.reset(detailsFrom(fresh))
      },
      onFinish: () => setReloading(false),
    })
  }

  const form = useForm({
    defaultValues: base ? detailsFrom(base) : emptyDetails(),
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
      const category = categories.find((candidate) => candidate.id === value.category_id)
      if (base === null) {
        const body: CreateBody = createBody(value, category, attributes)
        const key = intentKey.for(body)
        const outcome = await mutation.run(() =>
          client.request('createProduct', {
            params: { shopSlug },
            body,
            headers: { 'Idempotency-Key': key },
            timeout: 30_000,
          })
        )
        if (!outcome) return
        if (outcome.ok) {
          intentKey.reset()
          setReloading(true)
          router.visit(
            urlFor('seller.products.edit', { shopSlug, productId: outcome.data.data.id }),
            { onFinish: () => setReloading(false) }
          )
          return
        }
        failed(formApi, outcome, body.attributes)
        return
      }
      const body: UpdateBody = changedMembers(value, base, category, attributes)
      if (Object.keys(body).length === 0) {
        // Nothing of the user's is left to keep after a 412: the form catches up instead.
        if (conflict) restartFrom(formApi, conflict)
        else setDone('unchanged')
        return
      }
      // After a 412, "Keep my changes" sends the same members on the version now saved.
      const version = conflict?.version ?? base.version
      const outcome = await mutation.run(() =>
        client.request('updateProduct', {
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
      if ('problem' in outcome && outcome.problem.code === 'VERSION_CONFLICT') {
        const current = conflictProduct(outcome.problem)
        if (current) setConflict(current)
        else setProblem(outcome.problem)
        return
      }
      failed(formApi, outcome, body.attributes ?? [])
    },
  })

  /*
   * A refused save: offline keeps the form; a suspension or a change of the
   * product's status since the page opened reads the page again, which then
   * says why it cannot be edited; field errors land on their fields.
   */
  function failed(
    formApi: AnyFormApi,
    outcome: { ok: false; problem: Problem } | { ok: false; offline: true },
    sent: readonly { attribute_code: string }[]
  ) {
    if ('offline' in outcome) {
      setOffline(true)
      return
    }
    const found = outcome.problem
    // useApiMutation shows the wait next to the button.
    if (found.code === 'RATE_LIMITED') return
    if (found.code === 'SHOP_NOT_ACTIVE' || found.code === 'INVALID_STATE_TRANSITION') {
      setProblem(found)
      router.reload()
      return
    }
    if (found.errors?.length) {
      const sentCodes = sent.map((item) => item.attribute_code)
      const placed: Problem = {
        ...found,
        errors: found.errors.map((item) => ({
          ...item,
          field: detailsFieldOf(item.field, sentCodes),
        })),
      }
      report.failed(formApi, applyServerErrors(formApi, placed, known))
    } else {
      setProblem(found)
    }
  }

  const categoryId = useStore(form.store, (state) => state.values.category_id)
  const origin = useStore(form.store, (state) => state.values.origin)
  const brandId = useStore(form.store, (state) => state.values.brand_id)
  const category = categories.find((candidate) => candidate.id === categoryId)
  const shownAttributes = productAttributesFor(category, attributes)
  const savedAttributes = new Map(
    (base?.attributes ?? []).map((item) => [item.attribute_code, item.value_codes])
  )
  const summaryFields = [
    { name: 'title', id: FIELD_IDS.title },
    { name: 'category_id', id: FIELD_IDS.category_id },
    { name: 'brand_id', id: FIELD_IDS.brand_id },
    ...shownAttributes.map(({ attribute }) => ({
      name: `attributes.${attribute.code}`,
      id: attributeId(attribute.code),
    })),
    { name: 'description', id: FIELD_IDS.description },
    { name: 'manufacturer_name', id: FIELD_IDS.manufacturer_name },
    { name: 'origin', id: FIELD_IDS.origin },
    ...(origin === 'imported'
      ? [{ name: 'country_of_origin', id: FIELD_IDS.country_of_origin }]
      : []),
    { name: 'warranty_text', id: FIELD_IDS.warranty_text },
    { name: 'care_and_precautions', id: FIELD_IDS.care_and_precautions },
  ]
  const known = new Set(summaryFields.map((field) => field.name))
  const report = useErrorReport(summaryFields)
  const blocked = mutation.pending || reloading || mutation.retryIn > 0
  const chosenBrand = brands.find((brand) => brand.id === brandId)

  function discardAndReload() {
    if (mutation.pending || reloading || !conflict) return
    resetMessages()
    report.clear()
    restartFrom(form, conflict)
  }

  // Whether saving `values` sends `attributes` (a changed attribute, or a new category).
  function attributesSent(values: DetailsValues) {
    if (!base) return true
    const chosen = categories.find((candidate) => candidate.id === values.category_id)
    return changedMembers(values, base, chosen, attributes).attributes !== undefined
  }

  // A disclosure: optional on a draft, required on a live product (04a §7.6).
  function disclosureError(value: string, max: number) {
    const count = codePoints(value)
    if (count > max) return t('seller.product.too_long', { max })
    if (live && count === 0) return t('seller.product.live_required')
    return undefined
  }

  const conflictFields = conflict && base ? changedFields(base, conflict) : []
  const categoryOptions = categories.map((option) => ({
    value: option.id,
    label: option.is_active
      ? option.label
      : t('seller.product.category_retired', { name: option.label }),
  }))
  const brandOptions = [
    { value: OWN_LABEL, label: t('seller.product.own_label') },
    ...brands.map((brand) => ({ value: brand.id, label: brand.name })),
  ]

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
        <FieldLegend>{t('seller.product.basics_legend')}</FieldLegend>
        <form.Field
          name="title"
          validators={{
            onBlur: ({ value }) => {
              const count = codePoints(value)
              return count < titleLimit.min || count > titleLimit.max
                ? t('seller.product.title_rule', { min: titleLimit.min, max: titleLimit.max })
                : undefined
            },
          }}
        >
          {(field) => (
            <TextField
              id={FIELD_IDS.title}
              label={t('seller.product.title')}
              description={t('seller.product.title_help', { max: titleLimit.max })}
              autoComplete="off"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field
          name="category_id"
          validators={{
            onBlur: ({ value }) => (value === '' ? t('seller.product.category_rule') : undefined),
          }}
        >
          {(field) => (
            <ComboboxField
              id={FIELD_IDS.category_id}
              label={t('seller.product.category')}
              description={t('seller.product.category_help')}
              value={field.state.value}
              options={categoryOptions}
              placeholder={t('seller.product.category_placeholder')}
              searchLabel={t('seller.product.category_search')}
              emptyText={t('seller.product.category_none')}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
            />
          )}
        </form.Field>
        <form.Field name="brand_id">
          {(field) => (
            <ComboboxField
              id={FIELD_IDS.brand_id}
              label={t('seller.product.brand')}
              description={
                chosenBrand?.requires_moderation
                  ? t('seller.product.brand_help_moderated')
                  : t('seller.product.brand_help')
              }
              value={field.state.value === '' ? OWN_LABEL : field.state.value}
              options={brandOptions}
              placeholder={t('seller.product.own_label')}
              searchLabel={t('seller.product.brand_search')}
              emptyText={t('seller.product.brand_none')}
              errors={field.state.meta.errors}
              onChange={(value) => field.handleChange(value === OWN_LABEL ? '' : value)}
            />
          )}
        </form.Field>
      </FieldSet>

      <FieldSet className="gap-5">
        <FieldLegend>{t('seller.product.attributes_legend')}</FieldLegend>
        {shownAttributes.length === 0 ? (
          <FieldDescription>
            {category ? t('seller.product.attributes_none') : t('seller.product.attributes_first')}
          </FieldDescription>
        ) : (
          <FieldDescription>{t('seller.product.attributes_help')}</FieldDescription>
        )}
        {shownAttributes.map(({ attribute, required }) => {
          const saved = savedAttributes.get(attribute.code) ?? []
          const options = offeredValues(attribute, saved).map((value) => ({
            value: value.code,
            label: value.is_active
              ? value.label
              : t('seller.product.value_retired', { name: value.label }),
          }))
          const help = required ? t('seller.product.attribute_required') : undefined
          return (
            <form.Field
              key={attribute.code}
              name={`attributes.${attribute.code}`}
              validators={{
                // As the server: a live product's required attributes are checked when the
                // attributes or the category are sent, not on an edit elsewhere.
                onBlur: ({ value, fieldApi }) =>
                  live &&
                  required &&
                  (value ?? []).length === 0 &&
                  attributesSent(fieldApi.form.state.values)
                    ? t('seller.product.live_required')
                    : undefined,
              }}
            >
              {(field) =>
                attribute.input === 'multi' ? (
                  <CheckboxGroupField
                    id={attributeId(attribute.code)}
                    legend={attribute.name}
                    description={help}
                    options={options}
                    value={field.state.value ?? []}
                    errors={field.state.meta.errors}
                    onChange={(value) => changeAndRecheck(field, value)}
                    onBlur={field.handleBlur}
                  />
                ) : (
                  <ChoiceField
                    id={attributeId(attribute.code)}
                    label={attribute.name}
                    description={help}
                    value={field.state.value?.[0] ?? NOT_SET}
                    options={[{ value: NOT_SET, label: t('seller.product.not_set') }, ...options]}
                    triggerClassName={TALL}
                    errors={field.state.meta.errors}
                    onChange={(value) => changeAndRecheck(field, value === NOT_SET ? [] : [value])}
                  />
                )
              }
            </form.Field>
          )
        })}
      </FieldSet>

      <FieldSet className="gap-5">
        <FieldLegend>{t('seller.product.listing_legend')}</FieldLegend>
        <FieldDescription>
          {live ? t('seller.product.listing_help_live') : t('seller.product.listing_help_draft')}
        </FieldDescription>
        <form.Field
          name="description"
          validators={{
            onBlur: ({ value }) => disclosureError(value, PRODUCT_LIMITS.description.max),
          }}
        >
          {(field) => (
            <TextareaField
              id={FIELD_IDS.description}
              label={t('seller.product.description')}
              description={t('seller.product.description_help', {
                max: PRODUCT_LIMITS.description.max,
              })}
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field
          name="manufacturer_name"
          validators={{
            onBlur: ({ value }) => disclosureError(value, PRODUCT_LIMITS.manufacturerName.max),
          }}
        >
          {(field) => (
            <TextField
              id={FIELD_IDS.manufacturer_name}
              label={t('seller.product.manufacturer_name')}
              description={t('seller.product.manufacturer_name_help')}
              autoComplete="off"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="origin">
          {(field) => (
            <ChoiceField<Origin>
              id={FIELD_IDS.origin}
              label={t('seller.product.origin')}
              value={field.state.value}
              options={[
                { value: 'domestic', label: t('seller.product.origin_domestic') },
                { value: 'imported', label: t('seller.product.origin_imported') },
              ]}
              triggerClassName={TALL}
              errors={field.state.meta.errors}
              onChange={(value) => {
                if (value === field.state.value) return
                field.handleChange(value)
                // The country goes with the choice: its message goes too.
                if (value === 'domestic' && form.getFieldMeta('country_of_origin')) {
                  form.setFieldMeta('country_of_origin', (prev) => ({ ...prev, errorMap: {} }))
                }
              }}
            />
          )}
        </form.Field>
        {origin === 'imported' && (
          <form.Field
            name="country_of_origin"
            validators={{
              onBlur: ({ value, fieldApi }) =>
                live && fieldApi.form.getFieldValue('origin') === 'imported' && value === ''
                  ? t('seller.product.live_required')
                  : undefined,
            }}
          >
            {(field) => (
              <ComboboxField
                id={FIELD_IDS.country_of_origin}
                label={t('seller.product.country_of_origin')}
                description={t('seller.product.country_help')}
                value={field.state.value}
                options={countries}
                placeholder={t('seller.product.country_placeholder')}
                searchLabel={t('seller.product.country_search')}
                emptyText={t('seller.product.country_none')}
                errors={field.state.meta.errors}
                onChange={(value) => changeAndRecheck(field, value)}
              />
            )}
          </form.Field>
        )}
        <form.Field
          name="warranty_text"
          validators={{
            onBlur: ({ value }) => disclosureError(value, PRODUCT_LIMITS.warrantyText.max),
          }}
        >
          {(field) => (
            <TextareaField
              id={FIELD_IDS.warranty_text}
              label={t('seller.product.warranty_text')}
              description={t('seller.product.warranty_help')}
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field
          name="care_and_precautions"
          validators={{
            onBlur: ({ value }) => disclosureError(value, PRODUCT_LIMITS.careAndPrecautions.max),
          }}
        >
          {(field) => (
            <TextareaField
              id={FIELD_IDS.care_and_precautions}
              label={t('seller.product.care_and_precautions')}
              description={t('seller.product.care_help')}
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
      </FieldSet>

      {conflict && (
        <Alert ref={conflictRef} tabIndex={-1} role="alert" className="outline-none">
          <AlertTitle>{t('seller.product.conflict_title')}</AlertTitle>
          <AlertDescription>
            <p>{t('seller.product.conflict_body')}</p>
            {conflictFields.length > 0 && (
              <>
                <p>{t('seller.product.conflict_fields')}</p>
                <ul className="ml-4 list-disc">
                  {conflictFields.map((name) => (
                    <li key={name}>{t(LABELS[name])}</li>
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
          <AlertDescription>{t(DONE_MESSAGES[done])}</AlertDescription>
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
              : base
                ? t('seller.product.submit_edit')
                : t('seller.product.submit_create')}
          </Button>
          <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
        </div>
      )}
      {conflict && <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />}
    </form>
  )
}
