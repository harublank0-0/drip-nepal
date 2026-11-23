import { useEffect, useRef, useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { ACCOUNT_LIMITS, ADDRESS_LIMITS } from '@shared/constants/limits'
import { toNepalMobileE164 } from '@shared/format/phone'
import { client } from '~/client'
import { apiCall } from '~/lib/api'
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

/*
 * `AddressForm` (docs/08 §4.3; 01 FR-IAM-012, AC-FR-IAM-012-1 to -3): adds
 * an address (`createAddress`) or edits a saved one (`updateAddress`,
 * docs/06 §13.4) on `/account/addresses`; checkout reuses it in M5.
 *
 * The fields come in the order of AC-FR-IAM-012-1: Province → District →
 * Local level → Ward → area or tole → street or landmark, after the label
 * and the recipient. The provinces come with the page; each later list is
 * read when the one before it is chosen (`listDistricts`,
 * `listLocalLevels`, docs/06 §13.2), so only places of the reference data
 * can be chosen, never free text (AC-FR-IAM-012-1; the data is VX-10
 * [Verify-external] and is offered as choices, never described as
 * official). The province and ward are selects, the district a select
 * (at most 14 a province), the local level a combobox you can type in
 * (08 §9.2). Choosing a place clears the choices after it; the ward runs
 * from 1 to the chosen local level's `ward_count` (AC-FR-IAM-012-2). A list
 * that fails to load says so, with "Try again".
 *
 * The page never holds a saved phone, only its last four digits (docs/07
 * §5.5, AC-FR-IAM-012-5), so on edit the phone field starts empty and a
 * number typed there replaces the saved one, as on the profile form (08
 * §2.4). Edit sends only the members that changed, and the four place
 * members together when any of them did; a place the reference data has
 * since made inactive stays as saved until it is changed (04a §9).
 *
 * The form pattern of docs/08 §7.1: client rules mirror the server's
 * (`ADDRESS_LIMITS`, shared/format/phone.ts) and run on blur and submit;
 * the choices are checked on submit only, because opening a list moves
 * focus away from its button; a 422 lands on its fields, and
 * `address_limit` in the summary; any other problem shows above the button
 * with its reference; a failed submit keeps every value. `onDone` hands the
 * outcome to the address book, which reloads its props.
 */
export type Place = { code: string; name: string }
type LocalLevel = Place & { ward_count: number }

export type SavedAddress = {
  id: string
  label: string | null
  recipient_name: string
  recipient_phone_last4: string
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

type CreateBody = Route.Body<'createAddress'>
type UpdateBody = Route.Body<'updateAddress'>

type Values = {
  label: string
  recipient_name: string
  recipient_phone: string
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
  { name: 'label', id: 'address-label' },
  { name: 'recipient_name', id: 'address-recipient-name' },
  { name: 'recipient_phone', id: 'address-recipient-phone' },
  { name: 'province_code', id: 'address-province' },
  { name: 'district_code', id: 'address-district' },
  { name: 'local_level_code', id: 'address-local-level' },
  { name: 'ward_no', id: 'address-ward' },
  { name: 'area_tole', id: 'address-area-tole' },
  { name: 'street_landmark', id: 'address-street-landmark' },
  { name: 'is_default', id: 'address-is-default' },
] as const
const KNOWN = new Set<string>(FIELDS.map((field) => field.name))
const PLACE_FIELDS = ['province_code', 'district_code', 'local_level_code', 'ward_no'] as const

const RATE_LIMIT_ID = 'address-rate-limit'
const TALL = 'data-[size=default]:h-11 text-base md:text-sm'

// Code points after NFC, as the server counts them (docs/04 §2.8).
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

// The cascade's lists: read once per parent code, from the reference data.
async function districtsOf(province: string): Promise<Place[] | null> {
  const outcome = await apiCall(() =>
    client.request('listDistricts', { query: { province }, timeout: 30_000 })
  )
  return outcome.ok ? outcome.data.data : null
}

async function localLevelsOf(district: string): Promise<LocalLevel[] | null> {
  const outcome = await apiCall(() =>
    client.request('listLocalLevels', { query: { district }, timeout: 30_000 })
  )
  return outcome.ok ? outcome.data.data : null
}

type ListState<P> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; items: P[] }

/*
 * One step of the cascade: the list for `parent`, read when `parent` is
 * first chosen and kept for the life of the form. "Try again" forgets a
 * failure, so the effect reads it again. A late answer for a parent no
 * longer chosen is dropped.
 */
function useCascade<P>(parent: string, read: (parent: string) => Promise<P[] | null>) {
  const [lists, setLists] = useState<Record<string, P[] | 'failed'>>({})
  const entry = parent === '' ? undefined : lists[parent]
  useEffect(() => {
    if (parent === '' || entry !== undefined) return
    let live = true
    void read(parent).then((items) => {
      if (live) setLists((previous) => ({ ...previous, [parent]: items ?? 'failed' }))
    })
    return () => {
      live = false
    }
  }, [parent, entry, read])

  let state: ListState<P> = { status: 'idle' }
  if (parent !== '') {
    if (entry === undefined) state = { status: 'loading' }
    else if (entry === 'failed') state = { status: 'failed' }
    else state = { status: 'ready', items: entry }
  }
  function retry() {
    setLists((previous) => {
      const next = { ...previous }
      delete next[parent]
      return next
    })
  }
  return { state, retry }
}

// The saved place stays choosable on edit even when the reference data has made it inactive.
function withSaved<P extends Place>(items: P[], saved: P | null): P[] {
  if (!saved || items.some((item) => item.code === saved.code)) return items
  return [...items, saved]
}

function placeholderFor(state: ListState<unknown>, waiting: string, choose: string) {
  if (state.status === 'idle') return waiting
  if (state.status === 'loading') return t('account.addresses.form.loading')
  return choose
}

function createBody(value: Values): CreateBody {
  const phone = value.recipient_phone.trim()
  return {
    label: trimmedOrNull(value.label),
    recipient_name: value.recipient_name.trim(),
    // E.164 when the shared rule reads it; anything else goes as typed, for the server to refuse.
    recipient_phone: toNepalMobileE164(phone) ?? phone,
    province_code: value.province_code,
    district_code: value.district_code,
    local_level_code: value.local_level_code,
    ward_no: Number(value.ward_no),
    area_tole: value.area_tole.trim(),
    street_landmark: trimmedOrNull(value.street_landmark),
    is_default: value.is_default,
  }
}

// The members that differ from the saved address; the phone only when one was typed.
function changedMembers(value: Values, saved: SavedAddress): UpdateBody {
  const body: UpdateBody = {}
  const label = trimmedOrNull(value.label)
  if (label !== saved.label) body.label = label
  const name = value.recipient_name.trim()
  if (name !== saved.recipient_name) body.recipient_name = name
  const phone = value.recipient_phone.trim()
  if (phone !== '') body.recipient_phone = toNepalMobileE164(phone) ?? phone
  const placeChanged =
    value.province_code !== saved.province_code ||
    value.district_code !== saved.district_code ||
    value.local_level_code !== saved.local_level_code ||
    Number(value.ward_no) !== saved.ward_no
  if (placeChanged) {
    body.province_code = value.province_code
    body.district_code = value.district_code
    body.local_level_code = value.local_level_code
    body.ward_no = Number(value.ward_no)
  }
  const area = value.area_tole.trim()
  if (area !== saved.area_tole) body.area_tole = area
  const landmark = trimmedOrNull(value.street_landmark)
  if (landmark !== saved.street_landmark) body.street_landmark = landmark
  if (value.is_default && !saved.is_default) body.is_default = true
  return body
}

const {
  label: labelLimit,
  recipientName: nameLimit,
  areaTole: areaLimit,
  streetLandmark: landmarkLimit,
} = ADDRESS_LIMITS

export function AddressForm({
  provinces,
  saved,
  hasAddresses,
  onDone,
  onCancel,
}: {
  provinces: Place[]
  // The address being edited, or null to add one.
  saved: SavedAddress | null
  // Whether the user has an address already: the first one is the default whatever is ticked.
  hasAddresses: boolean
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
    recipient_name: saved?.recipient_name ?? '',
    recipient_phone: '',
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
          client.request('updateAddress', {
            params: { addressId: saved.id },
            body,
            timeout: 30_000,
          })
      } else {
        const body = createBody(value)
        send = () => client.request('createAddress', { body, timeout: 30_000 })
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
   * load. A saved unit the reference data has since made inactive stays the
   * current value, marked as no longer offered, and the ward stays disabled
   * until a current local level is chosen: any place change re-checks the
   * whole chain as active (06 note 61 (c)), so a ward alone could not be
   * saved there.
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
  // The chosen local level as the reference data offers it now; undefined while loading or retired.
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
    <section aria-labelledby="address-form-heading" className="space-y-4">
      <h2
        id="address-form-heading"
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-xl font-semibold tracking-tight outline-none"
      >
        {saved ? t('account.addresses.form.edit_heading') : t('account.addresses.form.add_heading')}
      </h2>
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
                t('account.addresses.form.label_rule', { max: labelLimit.max })
              ),
          }}
        >
          {(field) => (
            <TextField
              id="address-label"
              label={t('account.addresses.form.label')}
              description={t('account.addresses.form.label_help', { max: labelLimit.max })}
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field
          name="recipient_name"
          validators={{
            onBlur: ({ value }) =>
              boundedError(
                value,
                nameLimit,
                t('account.addresses.form.recipient_name_rule', { max: nameLimit.max })
              ),
          }}
        >
          {(field) => (
            <TextField
              id="address-recipient-name"
              label={t('account.addresses.form.recipient_name')}
              autoComplete="shipping name"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field
          name="recipient_phone"
          validators={{
            onBlur: ({ value }) => {
              // On edit an empty field keeps the saved number.
              if (value.trim() === '') {
                return saved ? undefined : t('account.addresses.form.recipient_phone_rule')
              }
              return value.length <= ACCOUNT_LIMITS.phoneInput.max &&
                toNepalMobileE164(value) !== null
                ? undefined
                : t('account.addresses.form.recipient_phone_rule')
            },
          }}
        >
          {(field) => (
            <NepalPhoneInput
              id="address-recipient-phone"
              label={t('account.addresses.form.recipient_phone')}
              description={
                saved
                  ? t('account.addresses.form.recipient_phone_help_saved', {
                      last4: saved.recipient_phone_last4,
                    })
                  : t('account.addresses.form.recipient_phone_help')
              }
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
            onBlur: ({ value }) => chosenError(value, t('account.addresses.form.province_rule')),
          }}
        >
          {(field) => (
            <ChoiceField
              id="address-province"
              label={t('account.addresses.form.province')}
              value={field.state.value}
              options={provinceItems.map((province) => ({
                value: province.code,
                label: province.name,
              }))}
              placeholder={t('account.addresses.form.province_placeholder')}
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
            onBlur: ({ value }) => chosenError(value, t('account.addresses.form.district_rule')),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <ChoiceField
                id="address-district"
                label={t('account.addresses.form.district')}
                value={field.state.value}
                options={districtItems.map((district) => ({
                  value: district.code,
                  label: district.name,
                }))}
                placeholder={placeholderFor(
                  districts.state,
                  t('account.addresses.form.district_waiting'),
                  t('account.addresses.form.district_placeholder')
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
            onBlur: ({ value }) => chosenError(value, t('account.addresses.form.local_level_rule')),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <ComboboxField
                id="address-local-level"
                label={t('account.addresses.form.local_level')}
                description={
                  retired
                    ? t('account.addresses.form.local_level_retired')
                    : t('account.addresses.form.local_level_help')
                }
                value={field.state.value}
                options={localLevelItems.map((localLevel) => ({
                  value: localLevel.code,
                  label: localLevel.name,
                }))}
                placeholder={placeholderFor(
                  localLevels.state,
                  t('account.addresses.form.local_level_waiting'),
                  t('account.addresses.form.local_level_placeholder')
                )}
                searchLabel={t('account.addresses.form.local_level_search')}
                emptyText={t('account.addresses.form.local_level_none')}
                disabled={localLevels.state.status !== 'ready'}
                errors={field.state.meta.errors}
                onChange={(value) => {
                  if (value === field.state.value) return
                  changeAndRecheck(field, value)
                  clearAfter('local_level_code')
                }}
              />
              <LoadFailed state={localLevels.state} onRetry={localLevels.retry} />
            </div>
          )}
        </form.Field>
        <form.Field
          name="ward_no"
          validators={{
            onBlur: ({ value }) => chosenError(value, t('account.addresses.form.ward_rule')),
          }}
        >
          {(field) => (
            <ChoiceField
              id="address-ward"
              label={t('account.addresses.form.ward')}
              value={field.state.value}
              options={wards.map((ward) => ({ value: ward, label: ward }))}
              placeholder={
                localLevelCode === ''
                  ? t('account.addresses.form.ward_waiting')
                  : t('account.addresses.form.ward_placeholder')
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
                t('account.addresses.form.area_tole_rule', {
                  min: areaLimit.min,
                  max: areaLimit.max,
                })
              ),
          }}
        >
          {(field) => (
            <TextField
              id="address-area-tole"
              label={t('account.addresses.form.area_tole')}
              autoComplete="shipping address-line1"
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
                t('account.addresses.form.street_landmark_rule', { max: landmarkLimit.max })
              ),
          }}
        >
          {(field) => (
            <TextField
              id="address-street-landmark"
              label={t('account.addresses.form.street_landmark')}
              description={t('account.addresses.form.street_landmark_help')}
              autoComplete="shipping address-line2"
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
                id="address-is-default"
                label={t('account.addresses.form.is_default')}
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
            <AlertDescription>{t('account.addresses.form.unchanged')}</AlertDescription>
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
              {mutation.pending && t('account.addresses.form.submitting')}
              {!mutation.pending &&
                (saved
                  ? t('account.addresses.form.submit_edit')
                  : t('account.addresses.form.submit_add'))}
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

// A list of the cascade that could not be read, with a way to read it again.
function LoadFailed({ state, onRetry }: { state: ListState<unknown>; onRetry: () => void }) {
  if (state.status !== 'failed') return null
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
      <span>{t('account.addresses.form.load_failed')}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {t('account.addresses.form.retry')}
      </Button>
    </div>
  )
}
