import { useEffect, useRef, useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { ACCOUNT_LIMITS, ADDRESS_LIMITS } from '@shared/constants/limits'
import { nepalShopPhoneNational, toNepalShopPhoneE164 } from '@shared/format/phone'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { TextField } from '~/components/forms/text_field'
import { NepalPhoneInput } from '~/components/forms/nepal_phone_input'
import { ChoiceField } from '~/components/forms/choice_field'
import { ComboboxField } from '~/components/forms/combobox_field'
import { CheckboxField } from '~/components/forms/checkbox_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'
import {
  districtsOf,
  LoadFailed,
  localLevelsOf,
  placeholderFor,
  useCascade,
  withSaved,
  type Place,
} from '~/components/forms/location_cascade'

/*
 * `PickupAddressForm` (docs/08 §2.5 `/shipping`, §4.3; 04a §6.6; R1-S part
 * 1c): adds a pickup address (`createPickupAddress`) or edits one
 * (`updatePickupAddress`, docs/06 §13.8), the place the courier collects
 * parcels from. It is the address book's form (`AddressForm`, M1 part 6b)
 * for a shop: the same cascade (location_cascade.tsx), with a contact
 * person and phone in place of the recipient. Province → District → Local
 * level → Ward from the location reference data, as `AddressForm` reads it:
 * the provinces come with the page (`provinces`, what `listProvinces`
 * answers), the districts and local levels are read when the step before
 * is chosen (`listDistricts`, `listLocalLevels`). A pickup address is an
 * address, not a delivery rule, so every active district is offered,
 * whatever its delivery zone. Only places of the reference data can be
 * chosen (VX-10); a saved place the data has since made inactive stays as
 * saved until it is changed.
 *
 * The contact phone is the shop's own data, shown in full to members with
 * `shop.shipping.manage` (06 §13.8 `getLogisticsSettings`), so on edit the
 * field starts with the saved number. A mobile or a landline with its area
 * code, as for the shop's numbers (AC-FR-SHOP-001-3,
 * `toNepalShopPhoneE164`), sent as people write it (`9841234567`,
 * `014123456`), the form `createPickupAddress` stores.
 *
 * An edit sends the whole address when any of it changed, as
 * `updatePickupAddress` requires (a missing label or landmark is cleared),
 * and `is_default: true` when "Make this the default" is ticked; nothing
 * when neither. A shop's first pickup address is its default whatever is
 * ticked, so the box is offered only once there is another.
 *
 * The form pattern of docs/08 §7.1, as `AddressForm`: client rules mirror
 * the server's and run on blur and submit (the choices on submit only); a
 * 422 lands on its field; any other problem shows above the button with
 * its reference; a failed submit keeps every value. `onDone` hands the
 * outcome to the list, which reloads its props.
 */
export type PickupAddress = {
  id: string
  label: string | null
  contact_name: string
  contact_phone: string
  province_code: string
  province_name: string
  district_code: string
  district_name: string
  local_level_code: string
  local_level_name: string
  ward_no: number
  area_tole: string
  street_landmark: string | null
  postal_code: string
  is_default: boolean
}

type CreateBody = Route.Body<'createPickupAddress'>
type UpdateBody = Route.Body<'updatePickupAddress'>

type Values = {
  label: string
  contact_name: string
  contact_phone: string
  province_code: string
  district_code: string
  local_level_code: string
  ward_no: string
  area_tole: string
  street_landmark: string
  is_default: boolean
}

// In the form's order, with each input's id, for the error summary (docs/08 §7.1).
const FIELDS = [
  { name: 'label', id: 'pickup-label' },
  { name: 'contact_name', id: 'pickup-contact-name' },
  { name: 'contact_phone', id: 'pickup-contact-phone' },
  { name: 'province_code', id: 'pickup-province' },
  { name: 'district_code', id: 'pickup-district' },
  { name: 'local_level_code', id: 'pickup-local-level' },
  { name: 'ward_no', id: 'pickup-ward' },
  { name: 'area_tole', id: 'pickup-area-tole' },
  { name: 'street_landmark', id: 'pickup-street-landmark' },
  { name: 'is_default', id: 'pickup-is-default' },
] as const
const KNOWN = new Set<string>(FIELDS.map((field) => field.name))
const PLACE_FIELDS = ['province_code', 'district_code', 'local_level_code', 'ward_no'] as const

const RATE_LIMIT_ID = 'pickup-rate-limit'
const TALL = 'data-[size=default]:h-11 text-base md:text-sm'

const {
  label: labelLimit,
  contactName: nameLimit,
  areaTole: areaLimit,
  streetLandmark: landmarkLimit,
} = ADDRESS_LIMITS

// Code points after NFC (docs/04 §2.8).
const codePoints = (value: string) => [...value.trim().normalize('NFC')].length
const trimmedOrNull = (value: string) => (value.trim() === '' ? null : value.trim())

function boundedError(value: string, bounds: { min: number; max: number }, message: string) {
  const count = codePoints(value)
  return count < bounds.min || count > bounds.max ? message : undefined
}

function optionalError(value: string, bounds: { min: number; max: number }, message: string) {
  return value.trim() === '' ? undefined : boundedError(value, bounds, message)
}

const chosenError = (value: string, message: string) => (value === '' ? message : undefined)

// The number as `createPickupAddress` stores it; anything the shared rule cannot read goes as typed.
function contactPhone(typed: string) {
  const e164 = toNepalShopPhoneE164(typed)
  return e164 ? nepalShopPhoneNational(e164) : typed.trim()
}

// The whole address, as both operations take it.
function addressMembers(value: Values) {
  return {
    label: trimmedOrNull(value.label),
    contact_name: value.contact_name.trim(),
    contact_phone: contactPhone(value.contact_phone),
    province_code: value.province_code,
    district_code: value.district_code,
    local_level_code: value.local_level_code,
    ward_no: Number(value.ward_no),
    area_tole: value.area_tole.trim(),
    street_landmark: trimmedOrNull(value.street_landmark),
  }
}

function createBody(value: Values): CreateBody {
  return { ...addressMembers(value), is_default: value.is_default }
}

// The whole address when any of it changed, and the default when newly ticked.
function changedMembers(value: Values, saved: PickupAddress): UpdateBody {
  const address = addressMembers(value)
  const changed =
    address.label !== saved.label ||
    address.contact_name !== saved.contact_name ||
    address.contact_phone !== saved.contact_phone ||
    address.province_code !== saved.province_code ||
    address.district_code !== saved.district_code ||
    address.local_level_code !== saved.local_level_code ||
    address.ward_no !== saved.ward_no ||
    address.area_tole !== saved.area_tole ||
    address.street_landmark !== saved.street_landmark
  const body: UpdateBody = changed ? { ...address } : {}
  if (value.is_default && !saved.is_default) body.is_default = true
  return body
}

export function PickupAddressForm({
  provinces,
  saved,
  hasAddresses,
  slug,
  onDone,
  onCancel,
}: {
  // What `listProvinces` answers: the cascade's first step.
  provinces: Place[]
  // The address being edited, or null to add one.
  saved: PickupAddress | null
  // Whether the shop has a pickup address already: the first one is the default.
  hasAddresses: boolean
  slug: string
  onDone: (outcome: 'created' | 'updated') => void
  onCancel: () => void
}) {
  const mutation = useApiMutation()
  const report = useErrorReport(FIELDS)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [unchanged, setUnchanged] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // The form replaces the list, so focus starts on its heading (docs/08 §9.1).
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  function resetMessages() {
    setProblem(null)
    setOffline(false)
    setUnchanged(false)
  }

  const defaultValues: Values = {
    label: saved?.label ?? '',
    contact_name: saved?.contact_name ?? '',
    contact_phone: saved?.contact_phone ?? '',
    province_code: saved?.province_code ?? '',
    district_code: saved?.district_code ?? '',
    local_level_code: saved?.local_level_code ?? '',
    ward_no: saved ? String(saved.ward_no) : '',
    area_tole: saved?.area_tole ?? '',
    street_landmark: saved?.street_landmark ?? '',
    is_default: false,
  }
  const form = useForm({
    defaultValues,
    // Submit re-runs every validator on the current values (docs/09 §13.5).
    canSubmitWhenInvalid: true,
    onSubmitInvalid: ({ formApi }) => {
      resetMessages()
      report.failed(formApi)
    },
    onSubmit: async ({ value, formApi }) => {
      if (mutation.pending) return
      resetMessages()
      report.clear()
      let send: () => Promise<unknown>
      if (saved) {
        const body = changedMembers(value, saved)
        if (Object.keys(body).length === 0) {
          setUnchanged(true)
          return
        }
        send = () =>
          client.request('updatePickupAddress', {
            params: { shopSlug: slug, addressId: saved.id },
            body,
            timeout: 30_000,
          })
      } else {
        const body = createBody(value)
        send = () =>
          client.request('createPickupAddress', {
            params: { shopSlug: slug },
            body,
            timeout: 30_000,
          })
      }
      const outcome = await mutation.run(send)
      if (!outcome) return
      if (outcome.ok) {
        onDone(saved ? 'updated' : 'created')
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        return
      }
      // useApiMutation shows the wait next to the button.
      if (outcome.problem.code === 'RATE_LIMITED') return
      if (outcome.problem.errors?.length) {
        report.failed(formApi, applyServerErrors(formApi, outcome.problem, KNOWN))
      } else {
        setProblem(outcome.problem)
      }
    },
  })

  const provinceCode = useStore(form.store, (state) => state.values.province_code)
  const districtCode = useStore(form.store, (state) => state.values.district_code)
  const localLevelCode = useStore(form.store, (state) => state.values.local_level_code)
  const districts = useCascade(provinceCode, districtsOf)
  const localLevels = useCascade(districtCode, localLevelsOf)

  /*
   * On edit the saved place shows on its buttons at once, while its lists
   * load, and stays choosable, marked as no longer offered, when
   * the reference data has made it inactive. The ward stays disabled until
   * a current local level is chosen, as in `AddressForm`.
   */
  const savedProvince = saved ? { code: saved.province_code, name: saved.province_name } : null
  const savedDistrict =
    saved && provinceCode === saved.province_code
      ? { code: saved.district_code, name: saved.district_name }
      : null
  const savedLocalLevel =
    saved && districtCode === saved.district_code
      ? { code: saved.local_level_code, name: saved.local_level_name, ward_count: 0 }
      : null
  const provinceItems = withSaved(provinces, savedProvince)
  const districtItems = withSaved(
    districts.state.status === 'ready' ? districts.state.items : [],
    savedDistrict
  )
  const localLevelItems = withSaved(
    localLevels.state.status === 'ready' ? localLevels.state.items : [],
    savedLocalLevel
  )
  const offeredLocalLevel =
    localLevels.state.status === 'ready'
      ? localLevels.state.items.find((item) => item.code === localLevelCode)
      : undefined
  const keepsSavedLocalLevel = saved !== null && localLevelCode === saved.local_level_code
  const retired = keepsSavedLocalLevel && localLevels.state.status === 'ready' && !offeredLocalLevel
  let wards: string[] = []
  if (offeredLocalLevel) {
    wards = Array.from({ length: offeredLocalLevel.ward_count }, (_, index) => String(index + 1))
  } else if (keepsSavedLocalLevel) {
    // Shown, not choosable, while the list loads or once the unit is retired.
    wards = [String(saved.ward_no)]
  }

  // Choosing a place clears every choice after it.
  function clearAfter(field: (typeof PLACE_FIELDS)[number]) {
    for (const next of PLACE_FIELDS.slice(PLACE_FIELDS.indexOf(field) + 1)) {
      form.setFieldValue(next, '')
    }
  }

  const blocked = mutation.pending || mutation.retryIn > 0
  const offerDefault = saved ? !saved.is_default : hasAddresses

  return (
    <section aria-labelledby="pickup-form-heading" className="space-y-4">
      <h3
        id="pickup-form-heading"
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-lg font-semibold tracking-tight outline-none"
      >
        {saved ? t('seller.shipping.pickup.edit_heading') : t('seller.shipping.pickup.add_heading')}
      </h3>
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <ErrorSummary form={form} summary={report.summary} summaryRef={report.summaryRef} />
        <form.Field
          name="label"
          validators={{
            onBlur: ({ value }) =>
              optionalError(
                value,
                labelLimit,
                t('seller.shipping.pickup.label_rule', { max: labelLimit.max })
              ),
          }}
        >
          {(field) => (
            <TextField
              id="pickup-label"
              label={t('seller.shipping.pickup.label')}
              description={t('seller.shipping.pickup.label_help', { max: labelLimit.max })}
              autoComplete="off"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field
          name="contact_name"
          validators={{
            onBlur: ({ value }) =>
              boundedError(
                value,
                nameLimit,
                t('seller.shipping.pickup.contact_name_rule', {
                  min: nameLimit.min,
                  max: nameLimit.max,
                })
              ),
          }}
        >
          {(field) => (
            <TextField
              id="pickup-contact-name"
              label={t('seller.shipping.pickup.contact_name')}
              description={t('seller.shipping.pickup.contact_name_help')}
              autoComplete="off"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field
          name="contact_phone"
          validators={{
            onBlur: ({ value }) =>
              value.length <= ACCOUNT_LIMITS.phoneInput.max && toNepalShopPhoneE164(value) !== null
                ? undefined
                : t('seller.shipping.pickup.contact_phone_rule'),
          }}
        >
          {(field) => (
            <NepalPhoneInput
              id="pickup-contact-phone"
              label={t('seller.shipping.pickup.contact_phone')}
              description={t('seller.shipping.pickup.contact_phone_help')}
              autoComplete="off"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field
          name="province_code"
          validators={{
            onBlur: ({ value }) => chosenError(value, t('seller.shipping.pickup.province_rule')),
          }}
        >
          {(field) => (
            <ChoiceField
              id="pickup-province"
              label={t('seller.shipping.pickup.province')}
              value={field.state.value}
              options={provinceItems.map((province) => ({
                value: province.code,
                label: province.name,
              }))}
              placeholder={t('seller.shipping.pickup.province_placeholder')}
              triggerClassName={TALL}
              errors={field.state.meta.errors}
              onChange={(value) => {
                if (value === field.state.value) return
                changeAndRecheck(field, value)
                clearAfter('province_code')
              }}
            />
          )}
        </form.Field>
        <form.Field
          name="district_code"
          validators={{
            onBlur: ({ value }) => chosenError(value, t('seller.shipping.pickup.district_rule')),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <ChoiceField
                id="pickup-district"
                label={t('seller.shipping.pickup.district')}
                value={field.state.value}
                options={districtItems.map((district) => ({
                  value: district.code,
                  label: district.name,
                }))}
                placeholder={placeholderFor(
                  districts.state,
                  t('seller.shipping.pickup.district_waiting'),
                  t('seller.shipping.pickup.district_placeholder')
                )}
                disabled={districts.state.status !== 'ready'}
                triggerClassName={TALL}
                errors={field.state.meta.errors}
                onChange={(value) => {
                  if (value === field.state.value) return
                  changeAndRecheck(field, value)
                  clearAfter('district_code')
                }}
              />
              <LoadFailed state={districts.state} onRetry={districts.retry} />
            </div>
          )}
        </form.Field>
        <form.Field
          name="local_level_code"
          validators={{
            onBlur: ({ value }) => chosenError(value, t('seller.shipping.pickup.local_level_rule')),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <ComboboxField
                id="pickup-local-level"
                label={t('seller.shipping.pickup.local_level')}
                description={
                  retired
                    ? t('seller.shipping.pickup.local_level_retired')
                    : t('seller.shipping.pickup.local_level_help')
                }
                value={field.state.value}
                options={localLevelItems.map((localLevel) => ({
                  value: localLevel.code,
                  label: localLevel.name,
                }))}
                placeholder={placeholderFor(
                  localLevels.state,
                  t('seller.shipping.pickup.local_level_waiting'),
                  t('seller.shipping.pickup.local_level_placeholder')
                )}
                searchLabel={t('seller.shipping.pickup.local_level_search')}
                emptyText={t('seller.shipping.pickup.local_level_none')}
                disabled={localLevels.state.status !== 'ready'}
                errors={field.state.meta.errors}
                onChange={(value) => {
                  if (value === field.state.value) return
                  changeAndRecheck(field, value)
                  clearAfter('local_level_code')
                  // Back on the saved local level, its saved ward comes back too (as AddressForm).
                  if (saved && value === saved.local_level_code) {
                    form.setFieldValue('ward_no', String(saved.ward_no))
                  }
                }}
              />
              <LoadFailed state={localLevels.state} onRetry={localLevels.retry} />
            </div>
          )}
        </form.Field>
        <form.Field
          name="ward_no"
          validators={{
            onBlur: ({ value }) => chosenError(value, t('seller.shipping.pickup.ward_rule')),
          }}
        >
          {(field) => (
            <ChoiceField
              id="pickup-ward"
              label={t('seller.shipping.pickup.ward')}
              value={field.state.value}
              options={wards.map((ward) => ({ value: ward, label: ward }))}
              placeholder={
                localLevelCode === ''
                  ? t('seller.shipping.pickup.ward_waiting')
                  : t('seller.shipping.pickup.ward_placeholder')
              }
              disabled={!offeredLocalLevel}
              triggerClassName={TALL}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
            />
          )}
        </form.Field>
        <form.Field
          name="area_tole"
          validators={{
            onBlur: ({ value }) =>
              boundedError(
                value,
                areaLimit,
                t('seller.shipping.pickup.area_tole_rule', {
                  min: areaLimit.min,
                  max: areaLimit.max,
                })
              ),
          }}
        >
          {(field) => (
            <TextField
              id="pickup-area-tole"
              label={t('seller.shipping.pickup.area_tole')}
              autoComplete="off"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field
          name="street_landmark"
          validators={{
            onBlur: ({ value }) =>
              optionalError(
                value,
                landmarkLimit,
                t('seller.shipping.pickup.street_landmark_rule', { max: landmarkLimit.max })
              ),
          }}
        >
          {(field) => (
            <TextField
              id="pickup-street-landmark"
              label={t('seller.shipping.pickup.street_landmark')}
              description={t('seller.shipping.pickup.street_landmark_help')}
              autoComplete="off"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        {offerDefault && (
          <form.Field name="is_default">
            {(field) => (
              <CheckboxField
                id="pickup-is-default"
                label={t('seller.shipping.pickup.is_default')}
                description={t('seller.shipping.pickup.is_default_help')}
                checked={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => field.handleChange(value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        )}
        {unchanged && (
          <Alert role="status">
            <AlertDescription>{t('seller.shipping.pickup.unchanged')}</AlertDescription>
          </Alert>
        )}
        <ProblemAlert problem={problem} offline={offline} />
        <div className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {/* aria-disabled, not disabled, while busy: it keeps focus (08 §7.1). */}
            <Button
              type="submit"
              className={`h-11 w-full text-base sm:w-auto ${PENDING_BUTTON}`}
              aria-disabled={blocked || undefined}
              aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
            >
              {mutation.pending && t('seller.shipping.pickup.submitting')}
              {!mutation.pending &&
                (saved
                  ? t('seller.shipping.pickup.submit_edit')
                  : t('seller.shipping.pickup.submit_add'))}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full text-base sm:w-auto"
              onClick={() => {
                if (!mutation.pending) onCancel()
              }}
            >
              {t('common.form.cancel')}
            </Button>
          </div>
          <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
        </div>
      </form>
    </section>
  )
}
