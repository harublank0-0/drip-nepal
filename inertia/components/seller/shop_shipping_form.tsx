import { useEffect, useRef, useState } from 'react'
import { useForm, useStore, type AnyFieldApi } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { SHIPPING_LIMITS } from '@shared/constants/limits'
import { formatNPR, minorToRupeesText, parseRupeesToMinor } from '@shared/format/money'
import {
  changedSince,
  coverageFor,
  coveredByZone,
  coversEveryDistrict,
  formFieldOf,
  offeredDistricts,
  parseDays,
  sameCodes,
  sameRates,
  savedCoverage,
  savedRates,
  type DeliveryAreas,
  type DeliveryProvince,
  type RateInput,
  type ShopShipping,
} from '@shared/ui/shop_shipping'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { FieldDescription, FieldError, FieldLegend, FieldSet } from '~/components/ui/field'
import { Label } from '~/components/ui/label'
import { CheckboxField } from '~/components/forms/checkbox_field'
import { TextField } from '~/components/forms/text_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'

/*
 * The delivery form of `/seller/{shopSlug}/shipping` (`replaceShopShipping`
 * ⟳, docs/06 §13.5, §8; docs/08 §2.5, §7.1; 01 FR-SHOP-004; R1-S part 1c).
 *
 * - Where the shop delivers: "Deliver to every district", or the districts
 *   it chooses, from the reference data's 77 (`delivery_areas`). The choice
 *   is grouped by province, one collapsible section each, so the long list
 *   stays short at 360 px: each section's button says how many of its
 *   districts are chosen, and inside, one box chooses the whole province
 *   (mixed while some are chosen) above a box per district, every row at
 *   least 44 px tall (docs/08 §9.3 SC 2.5.8). At least one district
 *   (AC-FR-SHOP-004-1).
 * - A rate per zone (A-27): the fee for one parcel, typed in rupees and
 *   turned into paisa exactly (`parseRupeesToMinor`, never a float,
 *   ADR-0007), shown back through `formatNPR`; and the delivery estimate,
 *   the fastest and slowest in whole days from 0 (same day) to 30, the
 *   fastest no longer than the slowest. A zone with a chosen district needs
 *   all three; a zone without may keep a rate or none (all three empty).
 *
 * Save sends only the set that differs from the shipping as last known
 * (`base`: the page's `shipping` prop, or the newer one a save or a 412
 * returned), each set whole, with `If-Match: "<version>"` of the same
 * (`shops.version`, which the settings form also moves), and nothing when
 * neither differs. After a save the form restarts from the 200's shipping
 * and the props are read again (docs/09 §13.3 rule 3). A 412
 * `VERSION_CONFLICT` keeps every value typed, moves focus to a panel naming
 * what changed since the page was opened (`current`), and offers "Keep my
 * changes", which sends the same sets on the new version, and "Discard mine
 * and reload", which restarts from `current` (docs/08 §7.1 "Concurrent
 * edits"); when the panel closes, focus moves to the save button. As in
 * the settings form (shop_settings_form.tsx).
 *
 * The form pattern of docs/08 §7.1: client rules mirror the server's
 * (`SHIPPING_LIMITS`, shared/ui/shop_shipping.ts) and run on blur and
 * submit; a 422 lands on its field, a rate's member on that zone's field
 * (`formFieldOf`), anything else in the error summary; any other problem
 * shows above the button with its reference; a failed submit keeps every
 * value. One request in flight and one `RATE_LIMITED` wait (`api_user`).
 */
type Body = Route.Body<'replaceShopShipping'>

type RateValues = { fee: string; min_days: string; max_days: string }
type Values = { all_districts: boolean; districts: string[]; rates: RateValues[] }
type RateMember = keyof RateValues

const RATE_MEMBERS: RateMember[] = ['fee', 'min_days', 'max_days']
const DISTRICTS_ID = 'shipping-districts'
const RATE_LIMIT_ID = 'shipping-rate-limit'
const { estimateDays } = SHIPPING_LIMITS

const rateId = (zone: string, member: RateMember) => `shipping-rate-${zone}-${member}`
const blankRate = (rate: RateValues) =>
  rate.fee.trim() === '' && rate.min_days.trim() === '' && rate.max_days.trim() === ''

function valuesFrom(shipping: ShopShipping, areas: DeliveryAreas): Values {
  return {
    all_districts: coversEveryDistrict(shipping, areas),
    districts: savedCoverage(shipping, areas),
    rates: areas.zones.map((zone) => {
      const rate = shipping.rates.find((saved) => saved.zone_code === zone.code)
      return rate
        ? {
            fee: minorToRupeesText(rate.fee.amount_minor),
            min_days: String(rate.est_min_days),
            max_days: String(rate.est_max_days),
          }
        : { fee: '', min_days: '', max_days: '' }
    }),
  }
}

// The rates the form holds, for the zones with any value; the validators have passed.
function ratesFrom(value: Values, areas: DeliveryAreas): RateInput[] {
  const rates: RateInput[] = []
  for (const [index, zone] of areas.zones.entries()) {
    const rate = value.rates[index]
    if (!rate || blankRate(rate)) continue
    const fee = parseRupeesToMinor(rate.fee)
    const min = parseDays(rate.min_days, estimateDays.max)
    const max = parseDays(rate.max_days, estimateDays.max)
    if (fee === null || min === null || max === null) continue
    rates.push({ zone_code: zone.code, fee_minor: fee, est_min_days: min, est_max_days: max })
  }
  return rates
}

// The sets that differ from `base`, each whole (docs/06 §13.5).
function changedMembers(value: Values, base: ShopShipping, areas: DeliveryAreas): Body {
  const body: Body = {}
  const coverage = coverageFor(value.all_districts, value.districts, areas)
  if (!sameCodes(coverage, savedCoverage(base, areas))) body.coverage = coverage
  const rates = ratesFrom(value, areas)
  if (!sameRates(rates, savedRates(base, areas.zones))) body.rates = rates
  return body
}

// The 412's `current`, when it is a shipping; anything else reads as "reload".
function conflictShipping(problem: Problem): ShopShipping | null {
  const current = problem.current
  return typeof current === 'object' && current !== null && 'coverage' in current
    ? (current as ShopShipping)
    : null
}

const DONE_MESSAGES = {
  saved: 'seller.shipping.saved',
  unchanged: 'seller.shipping.unchanged',
} as const

export function ShopShippingForm({
  shipping,
  areas,
  slug,
}: {
  shipping: ShopShipping
  areas: DeliveryAreas
  slug: string
}) {
  const mutation = useApiMutation()
  // In the form's order, with each input's id, for the error summary (docs/08 §7.1).
  const fields = [
    { name: 'districts', id: DISTRICTS_ID },
    ...areas.zones.flatMap((zone, index) =>
      RATE_MEMBERS.map((member) => ({
        name: `rates[${index}].${member}`,
        id: rateId(zone.code, member),
      }))
    ),
  ]
  const known = new Set(fields.map((field) => field.name))
  const report = useErrorReport(fields)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [done, setDone] = useState<'saved' | 'unchanged' | null>(null)
  // The shipping as saved now, after a 412; null otherwise.
  const [conflict, setConflict] = useState<ShopShipping | null>(null)
  // The shipping a save returned or a discard adopted, until the props catch up with it.
  const [latest, setLatest] = useState<ShopShipping | null>(null)
  // While the props are read again after a save or a discard.
  const [reloading, setReloading] = useState(false)
  const conflictRef = useRef<HTMLDivElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const hadConflict = useRef(false)
  const base = latest && latest.version > shipping.version ? latest : shipping
  const offered = offeredDistricts(areas)

  // A 412 swaps the save button for the conflict panel and back; focus follows (docs/08 §7.1, §9).
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

  // Restarts the form from `next`, then reads the props again; newer props win.
  function restartFrom(formApi: { reset: (values: Values) => void }, next: ShopShipping) {
    setLatest(next)
    setConflict(null)
    formApi.reset(valuesFrom(next, areas))
    setReloading(true)
    router.reload({
      only: ['shipping'],
      onSuccess: (page) => {
        const fresh = page.props.shipping as ShopShipping
        if (fresh.version !== next.version) formApi.reset(valuesFrom(fresh, areas))
      },
      onFinish: () => setReloading(false),
    })
  }

  const form = useForm({
    defaultValues: valuesFrom(base, areas),
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
      const body = changedMembers(value, base, areas)
      if (Object.keys(body).length === 0) {
        // Nothing of the user's is left to keep after a 412: the form catches up instead.
        if (conflict) restartFrom(formApi, conflict)
        else setDone('unchanged')
        return
      }
      // After a 412, "Keep my changes" sends the same sets on the version now saved.
      const version = conflict?.version ?? base.version
      const outcome = await mutation.run(() =>
        client.request('replaceShopShipping', {
          params: { shopSlug: slug },
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
        const current = conflictShipping(found)
        if (current) setConflict(current)
        else setProblem(found)
        return
      }
      // Suspended or closed since the page opened: the page says so once its props are read.
      if (found.code === 'SHOP_NOT_ACTIVE') {
        router.reload()
        return
      }
      if (found.errors?.length) {
        const sentZones = (body.rates ?? []).map((rate) => rate.zone_code)
        const placed: Problem = {
          ...found,
          errors: found.errors.map((item) => ({
            ...item,
            field: formFieldOf(item.field, sentZones, areas.zones),
          })),
        }
        report.failed(formApi, applyServerErrors(formApi, placed, known))
      } else {
        setProblem(found)
      }
    },
  })

  const allDistricts = useStore(form.store, (state) => state.values.all_districts)
  const chosen = useStore(form.store, (state) => state.values.districts)
  const rateValues = useStore(form.store, (state) => state.values.rates)
  const coverage = coverageFor(allDistricts, chosen, areas)
  const coveredCounts = coveredByZone(coverage, areas)
  const blocked = mutation.pending || reloading || mutation.retryIn > 0

  // Whether the zone at `index` holds a chosen district, on the form's current values.
  function zoneCovered(index: number) {
    const zone = areas.zones[index]
    const now = coverageFor(
      form.getFieldValue('all_districts'),
      form.getFieldValue('districts'),
      areas
    )
    return zone !== undefined && (coveredByZone(now, areas).get(zone.code) ?? 0) > 0
  }

  // A rate member's message: needed when its zone is covered, or when any of the three is typed.
  function rateError(index: number, member: RateMember): string | undefined {
    const zone = areas.zones[index]
    const rate = form.getFieldValue('rates')[index]
    if (!zone || !rate) return undefined
    if (!zoneCovered(index) && blankRate(rate)) return undefined
    if (member === 'fee') {
      if (rate.fee.trim() === '') return t('seller.shipping.fee_required', { zone: zone.name })
      return parseRupeesToMinor(rate.fee) === null ? t('seller.shipping.fee_rule') : undefined
    }
    const typed = member === 'min_days' ? rate.min_days : rate.max_days
    if (typed.trim() === '') {
      return member === 'min_days'
        ? t('seller.shipping.min_days_required', { zone: zone.name })
        : t('seller.shipping.max_days_required', { zone: zone.name })
    }
    const days = parseDays(typed, estimateDays.max)
    if (days === null) return t('seller.shipping.days_rule', { max: estimateDays.max })
    if (member === 'max_days') {
      const min = parseDays(rate.min_days, estimateDays.max)
      if (min !== null && days < min) return t('seller.shipping.max_before_min')
    }
    return undefined
  }

  // Coverage and the other members decide a rate's message: those showing one are checked again.
  function recheckRates() {
    for (const index of areas.zones.keys()) {
      for (const member of RATE_MEMBERS) {
        const name = `rates[${index}].${member}` as const
        if (form.getFieldMeta(name)?.errorMap.onBlur) void form.validateField(name, 'blur')
      }
    }
  }

  function recheckDistricts() {
    if (form.getFieldMeta('districts')?.errorMap.onBlur) {
      void form.validateField('districts', 'blur')
    }
  }

  function setDistricts(field: AnyFieldApi, next: string[]) {
    changeAndRecheck(field, [...new Set(next)].sort())
    recheckRates()
  }

  function discardAndReload() {
    if (mutation.pending || reloading || !conflict) return
    resetMessages()
    report.clear()
    restartFrom(form, conflict)
  }

  const conflictChanges = conflict ? changedSince(base, conflict, areas) : null
  const conflictLabels = conflictChanges
    ? [
        ...(conflictChanges.coverage ? [t('seller.shipping.coverage_legend')] : []),
        ...areas.zones
          .filter((zone) => conflictChanges.zones.includes(zone.code))
          .map((zone) => t('seller.shipping.zone_rate', { zone: zone.name })),
      ]
    : []

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

      <FieldSet className="gap-4">
        <FieldLegend>{t('seller.shipping.coverage_legend')}</FieldLegend>
        <FieldDescription>{t('seller.shipping.coverage_help')}</FieldDescription>
        <form.Field name="all_districts">
          {(field) => (
            <CheckboxField
              id="shipping-all-districts"
              label={t('seller.shipping.all_districts', { count: offered.length })}
              checked={field.state.value}
              errors={[]}
              onChange={(checked) => {
                field.handleChange(checked)
                recheckDistricts()
                recheckRates()
              }}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field
          name="districts"
          validators={{
            // Checked on submit only: the boxes are many, and none of them is the field's blur.
            onBlur: ({ value, fieldApi }) =>
              !fieldApi.form.getFieldValue('all_districts') &&
              coverageFor(false, value, areas).length === 0
                ? t('seller.shipping.coverage_required')
                : undefined,
          }}
        >
          {(field) => {
            const messages = field.state.meta.errors.filter(
              (error): error is string => typeof error === 'string'
            )
            const picked = new Set(field.state.value)
            return (
              <div
                id={DISTRICTS_ID}
                tabIndex={-1}
                className="space-y-3 outline-none"
                aria-describedby={messages.length > 0 ? `${DISTRICTS_ID}-error` : undefined}
              >
                {allDistricts ? (
                  <p className="text-muted-foreground text-sm">
                    {t('seller.shipping.all_districts_note', { count: offered.length })}
                  </p>
                ) : (
                  <>
                    <p className="text-muted-foreground text-sm" aria-live="polite">
                      {t('seller.shipping.chosen_count', {
                        chosen: coverage.length,
                        total: offered.length,
                      })}
                    </p>
                    <Accordion type="multiple" className="rounded-lg border">
                      {areas.provinces.map((province) => (
                        <ProvinceDistricts
                          key={province.code}
                          province={province}
                          picked={picked}
                          onChange={(codes, on) =>
                            setDistricts(
                              field,
                              on
                                ? [...field.state.value, ...codes]
                                : field.state.value.filter((code) => !codes.includes(code))
                            )
                          }
                        />
                      ))}
                    </Accordion>
                  </>
                )}
                <FieldError
                  id={`${DISTRICTS_ID}-error`}
                  errors={messages.map((message) => ({ message }))}
                />
              </div>
            )
          }}
        </form.Field>
      </FieldSet>

      <FieldSet className="gap-5">
        <FieldLegend>{t('seller.shipping.rates_legend')}</FieldLegend>
        <FieldDescription>{t('seller.shipping.rates_help')}</FieldDescription>
        {areas.zones.map((zone, index) => {
          const covered = coveredCounts.get(zone.code) ?? 0
          const fee = parseRupeesToMinor(rateValues[index]?.fee ?? '')
          return (
            <fieldset
              key={zone.code}
              className="space-y-3 rounded-lg border p-4"
              aria-describedby={`shipping-zone-${zone.code}-help`}
            >
              <legend className="px-1 font-medium">{zone.name}</legend>
              <p id={`shipping-zone-${zone.code}-help`} className="text-muted-foreground text-sm">
                {covered > 0
                  ? t('seller.shipping.zone_covered', { count: covered })
                  : t('seller.shipping.zone_not_covered')}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <form.Field
                  name={`rates[${index}].fee`}
                  validators={{ onBlur: () => rateError(index, 'fee') }}
                >
                  {(field) => (
                    <TextField
                      id={rateId(zone.code, 'fee')}
                      label={t('seller.shipping.fee')}
                      description={
                        fee === null
                          ? t('seller.shipping.fee_help')
                          : t('seller.shipping.fee_preview', { amount: formatNPR(fee) })
                      }
                      inputMode="decimal"
                      autoComplete="off"
                      value={field.state.value}
                      errors={field.state.meta.errors}
                      onChange={(value) => {
                        changeAndRecheck(field, value)
                        recheckRates()
                      }}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
                <form.Field
                  name={`rates[${index}].min_days`}
                  validators={{ onBlur: () => rateError(index, 'min_days') }}
                >
                  {(field) => (
                    <TextField
                      id={rateId(zone.code, 'min_days')}
                      label={t('seller.shipping.min_days')}
                      description={t('seller.shipping.min_days_help')}
                      inputMode="numeric"
                      autoComplete="off"
                      value={field.state.value}
                      errors={field.state.meta.errors}
                      onChange={(value) => {
                        changeAndRecheck(field, value)
                        recheckRates()
                      }}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
                <form.Field
                  name={`rates[${index}].max_days`}
                  validators={{ onBlur: () => rateError(index, 'max_days') }}
                >
                  {(field) => (
                    <TextField
                      id={rateId(zone.code, 'max_days')}
                      label={t('seller.shipping.max_days')}
                      description={t('seller.shipping.max_days_help', { max: estimateDays.max })}
                      inputMode="numeric"
                      autoComplete="off"
                      value={field.state.value}
                      errors={field.state.meta.errors}
                      onChange={(value) => {
                        changeAndRecheck(field, value)
                        recheckRates()
                      }}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
              </div>
            </fieldset>
          )
        })}
      </FieldSet>

      {conflict && (
        <Alert ref={conflictRef} tabIndex={-1} role="alert" className="outline-none">
          <AlertTitle>{t('seller.shipping.conflict_title')}</AlertTitle>
          <AlertDescription>
            <p>{t('seller.shipping.conflict_body')}</p>
            {conflictLabels.length > 0 ? (
              <>
                <p>{t('seller.shipping.conflict_fields')}</p>
                <ul className="ml-4 list-disc">
                  {conflictLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{t('seller.shipping.conflict_elsewhere')}</p>
            )}
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              {/* Submits the form, so the values are checked again before they are sent. */}
              <Button
                type="submit"
                className={`h-11 w-full text-base sm:w-auto ${PENDING_BUTTON}`}
                aria-disabled={blocked || undefined}
                aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
              >
                {t('seller.shipping.conflict_keep')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`h-11 w-full text-base sm:w-auto ${PENDING_BUTTON}`}
                aria-disabled={blocked || undefined}
                onClick={discardAndReload}
              >
                {t('seller.shipping.conflict_discard')}
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
      <ProblemAlert problem={problem} offline={offline} />
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
              ? t('seller.shipping.submitting')
              : t('seller.shipping.submit')}
          </Button>
          <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
        </div>
      )}
      {conflict && <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />}
    </form>
  )
}

/*
 * One province's districts, a collapsible section (docs/08 §2.5): its
 * button names the province and how many of its districts are chosen;
 * inside, a box for the whole province, mixed while only some are chosen,
 * and a box per district. The boxes form a group named by the province.
 */
function ProvinceDistricts({
  province,
  picked,
  onChange,
}: {
  province: DeliveryProvince
  picked: ReadonlySet<string>
  onChange: (codes: string[], on: boolean) => void
}) {
  const codes = province.districts.map((district) => district.code)
  const count = codes.filter((code) => picked.has(code)).length
  let whole: boolean | 'indeterminate' = false
  if (count === codes.length) whole = true
  else if (count > 0) whole = 'indeterminate'
  const wholeId = `shipping-province-${province.code}`
  return (
    <AccordionItem value={province.code} className="px-4">
      <AccordionTrigger className="min-h-11 items-center text-base md:text-sm">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span>{province.name}</span>
          <span className="text-muted-foreground font-normal">
            {t('seller.shipping.province_count', { chosen: count, total: codes.length })}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <fieldset className="space-y-1 pb-2">
          <legend className="sr-only">
            {t('seller.shipping.province_legend', { province: province.name })}
          </legend>
          <div className="flex min-h-11 items-center gap-3">
            <Checkbox
              id={wholeId}
              checked={whole}
              onCheckedChange={(next) => onChange(codes, next === true)}
            />
            <Label htmlFor={wholeId} className="text-base md:text-sm">
              {t('seller.shipping.province_all', { province: province.name, count: codes.length })}
            </Label>
          </div>
          <ul className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {province.districts.map((district) => {
              const id = `shipping-district-${district.code}`
              return (
                <li key={district.code} className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    id={id}
                    checked={picked.has(district.code)}
                    onCheckedChange={(next) => onChange([district.code], next === true)}
                  />
                  <Label htmlFor={id} className="text-base font-normal md:text-sm">
                    {district.name}
                  </Label>
                </li>
              )
            })}
          </ul>
        </fieldset>
      </AccordionContent>
    </AccordionItem>
  )
}
