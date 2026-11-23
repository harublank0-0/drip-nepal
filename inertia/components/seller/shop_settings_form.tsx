import { useEffect, useRef, useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { ACCOUNT_LIMITS, SHOP_LIMITS } from '@shared/constants/limits'
import { nepalShopPhoneNational, toNepalShopPhoneE164 } from '@shared/format/phone'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck, PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { FieldDescription, FieldLegend, FieldSet } from '~/components/ui/field'
import { TextField } from '~/components/forms/text_field'
import { TextareaField } from '~/components/forms/textarea_field'
import { NepalPhoneInput } from '~/components/forms/nepal_phone_input'
import { ChoiceField } from '~/components/forms/choice_field'
import { CheckboxField } from '~/components/forms/checkbox_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'

/*
 * The shop settings form of `/seller/{shopSlug}/settings` (`updateShopProfile`
 * ⟳, docs/06 §13.5, §8; docs/08 §2.5, §7.1; 01 FR-SHOP-003,
 * AC-FR-SHOP-013-2; R1-S part 1b).
 *
 * - The public profile, for every member who may edit it: the description
 *   and the shop's contact email and phone, a mobile or a landline
 *   (AC-FR-SHOP-001-3), entered for the shop and never filled in from the
 *   user's own (`autocomplete="off"`, AC-FR-SHOP-001-4). The name and the
 *   web address are shown, not edited: no operation changes the name, and
 *   staff change the slug (FR-SHOP-012).
 * - For the owner only, because only the owner sees them
 *   (AC-FR-SHOP-013-4; the props hold `null` for anyone else): the business
 *   details, the return policy and the grievance contact, its phone as
 *   saved. The business type shows the registration number and authority
 *   for a registered business only; switching to an individual clears both
 *   on save. The PAN/VAT number shows for both types: a registered or
 *   VAT-registered business needs it, and for an individual it is optional
 *   while OD-16 and VX-05 are open.
 *
 * Save sends only the members that differ from the shop as last known
 * (`base`: the page's `shop` prop, or the newer shop a save or a 412
 * returned), with `If-Match: "<version>"` of the same, and nothing when none
 * does. After a save the form restarts from the 200's shop, so a failed
 * props reload cannot leave a stale version, and the props are read again
 * (docs/09 §13.3 rule 3); the button stays busy until then. A 412
 * `VERSION_CONFLICT` keeps every value the user typed, moves focus to a
 * panel listing the fields whose saved value changed since the page was
 * opened (`current`), and offers "Keep my changes", which sends the same
 * members on the new version, and "Discard mine and reload", which restarts
 * from `current` (docs/08 §7.1 "Concurrent edits"); when the panel closes,
 * focus moves to the save button, never to the page (08 §9). Nothing is
 * overwritten silently: only the members the user changed are sent.
 *
 * The form pattern of docs/08 §7.1: client rules mirror the server's
 * (`SHOP_LIMITS`, shared/format/phone.ts) and run on blur and submit; a 422
 * lands on its fields, and one on a field the form does not show (an
 * identifier of a business type not chosen here) in the error summary; any
 * other problem shows above the button with its reference; a failed submit
 * keeps every value. One request in flight and one `RATE_LIMITED` wait
 * (`shop_profile_update`, 20 an hour).
 */
export type SellerShop = {
  slug: string
  name: string
  status: string
  suspension_mode: string | null
  description: string | null
  contact_email: string
  contact_phone: string
  business_details: {
    business_type: string
    registration_number: string | null
    registration_authority: string | null
    pan_vat_number: string | null
    is_vat_registered: boolean
    return_policy_text: string
  } | null
  grievance_contact: { name: string; phone: string } | null
  agreement: { version: string; is_final: boolean; accepted: boolean }
  version: number
}

type Body = Route.Body<'updateShopProfile'>
type BusinessType = 'individual' | 'registered_business'

type Values = {
  description: string
  contact_email: string
  contact_phone: string
  business_type: BusinessType
  registration_number: string
  registration_authority: string
  pan_vat_number: string
  is_vat_registered: boolean
  return_policy_text: string
  grievance_contact_name: string
  grievance_contact_phone: string
}

// In the form's order, with each input's id, for the error summary (docs/08 §7.1).
const FIELDS = [
  { name: 'description', id: 'settings-description' },
  { name: 'contact_email', id: 'settings-contact-email' },
  { name: 'contact_phone', id: 'settings-contact-phone' },
  { name: 'business_type', id: 'settings-business-type' },
  { name: 'registration_number', id: 'settings-registration-number' },
  { name: 'registration_authority', id: 'settings-registration-authority' },
  { name: 'pan_vat_number', id: 'settings-pan-vat-number' },
  { name: 'is_vat_registered', id: 'settings-is-vat-registered' },
  { name: 'return_policy_text', id: 'settings-return-policy' },
  { name: 'grievance_contact_name', id: 'settings-grievance-name' },
  { name: 'grievance_contact_phone', id: 'settings-grievance-phone' },
] as const
const KNOWN = new Set<string>(FIELDS.map((field) => field.name))
const OWNER_FIELDS = [
  'business_type',
  'registration_number',
  'registration_authority',
  'pan_vat_number',
  'is_vat_registered',
  'return_policy_text',
] as const
const GRIEVANCE_FIELDS = ['grievance_contact_name', 'grievance_contact_phone'] as const

// Each field's label, also used to list what changed after a 412.
const LABELS: Record<keyof Values, Parameters<typeof t>[0]> = {
  description: 'seller.settings.description',
  contact_email: 'seller.settings.contact_email',
  contact_phone: 'seller.settings.contact_phone',
  business_type: 'seller.settings.business_type',
  registration_number: 'seller.settings.registration_number',
  registration_authority: 'seller.settings.registration_authority',
  pan_vat_number: 'seller.settings.pan_vat_number',
  is_vat_registered: 'seller.settings.is_vat_registered',
  return_policy_text: 'seller.settings.return_policy_text',
  grievance_contact_name: 'seller.settings.grievance_contact_name',
  grievance_contact_phone: 'seller.settings.grievance_contact_phone',
}

const RATE_LIMIT_ID = 'settings-rate-limit'
const TALL = 'data-[size=default]:h-11 text-base md:text-sm'

const {
  description: descriptionLimit,
  returnPolicyText: policyLimit,
  grievanceContactName: grievanceNameLimit,
  registrationNumber: numberLimit,
  registrationAuthority: authorityLimit,
  panVat,
} = SHOP_LIMITS

// Code points after NFC, as the server counts them (docs/04 §2.8).
const codePoints = (value: string) => [...value.trim().normalize('NFC')].length
const trimmedOrNull = (value: string) => (value.trim() === '' ? null : value.trim())

function boundedError(value: string, bounds: { min: number; max: number }, message: string) {
  const count = codePoints(value)
  return count < bounds.min || count > bounds.max ? message : undefined
}

// Only what the server would refuse too: an `@` with something on each side, within 254.
function emailError(value: string) {
  const email = value.trim()
  const at = email.lastIndexOf('@')
  const shaped = at > 0 && at < email.length - 1
  return shaped && email.length <= ACCOUNT_LIMITS.email.max
    ? undefined
    : t('seller.settings.contact_email_rule')
}

function phoneError(value: string) {
  return value.length <= ACCOUNT_LIMITS.phoneInput.max && toNepalShopPhoneE164(value) !== null
    ? undefined
    : t('seller.settings.phone_rule')
}

// A shop number in E.164 when the shared rule reads it; anything else as typed, for the server to refuse.
const shopPhone = (value: string) => toNepalShopPhoneE164(value) ?? value.trim()

const asBusinessType = (value: string | undefined): BusinessType =>
  value === 'registered_business' ? 'registered_business' : 'individual'

function valuesFrom(shop: SellerShop): Values {
  const details = shop.business_details
  const grievance = shop.grievance_contact
  return {
    description: shop.description ?? '',
    contact_email: shop.contact_email,
    contact_phone: nepalShopPhoneNational(shop.contact_phone),
    business_type: asBusinessType(details?.business_type),
    registration_number: details?.registration_number ?? '',
    registration_authority: details?.registration_authority ?? '',
    pan_vat_number: details?.pan_vat_number ?? '',
    is_vat_registered: details?.is_vat_registered ?? false,
    return_policy_text: details?.return_policy_text ?? '',
    grievance_contact_name: grievance?.name ?? '',
    grievance_contact_phone: grievance ? nepalShopPhoneNational(grievance.phone) : '',
  }
}

/*
 * The members of `value` that differ from `shop`, as the server stores them.
 * The owner-only members only when the props hold them, so a member who is
 * not the owner never sends one (the server would answer 403). An
 * individual's registration number and authority are sent as null.
 */
function changedMembers(value: Values, shop: SellerShop): Body {
  const body: Body = {}
  const description = trimmedOrNull(value.description)
  if (description !== shop.description) body.description = description
  const email = value.contact_email.trim()
  if (email.toLowerCase() !== shop.contact_email) body.contact_email = email
  const phone = shopPhone(value.contact_phone)
  if (phone !== shop.contact_phone) body.contact_phone = phone
  const details = shop.business_details
  if (details) {
    if (value.business_type !== details.business_type) body.business_type = value.business_type
    const registered = value.business_type === 'registered_business'
    const number = registered ? trimmedOrNull(value.registration_number) : null
    if (number !== details.registration_number) body.registration_number = number
    const authority = registered ? trimmedOrNull(value.registration_authority) : null
    if (authority !== details.registration_authority) body.registration_authority = authority
    const pan = trimmedOrNull(value.pan_vat_number)
    if (pan !== details.pan_vat_number) body.pan_vat_number = pan
    if (value.is_vat_registered !== details.is_vat_registered) {
      body.is_vat_registered = value.is_vat_registered
    }
    const policy = value.return_policy_text.trim()
    if (policy !== details.return_policy_text) body.return_policy_text = policy
  }
  const grievance = shop.grievance_contact
  if (grievance) {
    const name = value.grievance_contact_name.trim()
    if (name !== grievance.name) body.grievance_contact_name = name
    const grievancePhone = shopPhone(value.grievance_contact_phone)
    if (grievancePhone !== grievance.phone) body.grievance_contact_phone = grievancePhone
  }
  return body
}

// The fields whose saved value differs between two readings of the shop, in the form's order.
function changedFields(before: SellerShop, after: SellerShop) {
  const was = valuesFrom(before)
  const now = valuesFrom(after)
  return FIELDS.filter(({ name }) => was[name] !== now[name]).map(({ name }) => t(LABELS[name]))
}

// The 412's `current`, when it is a shop; anything else reads as "reload".
function conflictShop(problem: Problem): SellerShop | null {
  const current = problem.current
  return typeof current === 'object' && current !== null && 'version' in current
    ? (current as SellerShop)
    : null
}

/*
 * The fields the form shows for `value` and `shop`: a server error on any
 * other field goes to the error summary, because its input, link target and
 * focus target are not on the page.
 */
function shownFields(value: Values, shop: SellerShop) {
  const shown = new Set(KNOWN)
  if (!shop.business_details) for (const name of OWNER_FIELDS) shown.delete(name)
  if (!shop.grievance_contact) for (const name of GRIEVANCE_FIELDS) shown.delete(name)
  if (value.business_type !== 'registered_business') {
    shown.delete('registration_number')
    shown.delete('registration_authority')
  }
  return shown
}

// The status line after each outcome.
const DONE_MESSAGES = {
  saved: 'seller.settings.saved',
  unchanged: 'seller.settings.unchanged',
} as const

export function ShopSettingsForm({ shop }: { shop: SellerShop }) {
  const mutation = useApiMutation()
  const report = useErrorReport(FIELDS)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [done, setDone] = useState<'saved' | 'unchanged' | null>(null)
  // The shop as saved now, after a 412; null otherwise.
  const [conflict, setConflict] = useState<SellerShop | null>(null)
  // The shop a save returned or a discard adopted, until the props catch up with it.
  const [latest, setLatest] = useState<SellerShop | null>(null)
  // While the props are read again after a save or a discard.
  const [reloading, setReloading] = useState(false)
  const conflictRef = useRef<HTMLDivElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const hadConflict = useRef(false)
  // The newest shop known: the props, or what a save or discard returned before they caught up.
  const base = latest && latest.version > shop.version ? latest : shop

  /*
   * A 412 replaces the save button with the conflict panel, and closing the
   * panel brings the button back: focus follows, so it never falls to the
   * page (docs/08 §7.1, §9). The panel is also a live alert.
   */
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

  /*
   * Restarts the form from `next`, the shop as now saved, then reads the
   * props again. Should they bring a newer version (another save in
   * between), the form restarts from them instead.
   */
  function restartFrom(formApi: { reset: (values: Values) => void }, next: SellerShop) {
    setLatest(next)
    setConflict(null)
    formApi.reset(valuesFrom(next))
    setReloading(true)
    router.reload({
      only: ['shop'],
      onSuccess: (page) => {
        const fresh = page.props.shop as SellerShop
        if (fresh.version !== next.version) formApi.reset(valuesFrom(fresh))
      },
      onFinish: () => setReloading(false),
    })
  }

  const form = useForm({
    // From `base`, so a render before the props catch up never puts their older values back.
    defaultValues: valuesFrom(base),
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
      const body = changedMembers(value, base)
      if (Object.keys(body).length === 0) {
        // Nothing of the user's is left to keep after a 412: the form catches up instead.
        if (conflict) restartFrom(formApi, conflict)
        else setDone('unchanged')
        return
      }
      // After a 412, "Keep my changes" sends the same members on the version now saved.
      const version = conflict?.version ?? base.version
      const outcome = await mutation.run(() =>
        client.request('updateShopProfile', {
          params: { shopSlug: shop.slug },
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
        const current = conflictShop(found)
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
        report.failed(formApi, applyServerErrors(formApi, found, shownFields(value, base)))
      } else {
        setProblem(found)
      }
    },
  })

  const businessType = useStore(form.store, (state) => state.values.business_type)
  const vatRegistered = useStore(form.store, (state) => state.values.is_vat_registered)
  const details = base.business_details
  const grievance = base.grievance_contact
  const blocked = mutation.pending || reloading || mutation.retryIn > 0
  const registered = businessType === 'registered_business'
  const panRequired = registered || vatRegistered

  function discardAndReload() {
    if (mutation.pending || reloading || !conflict) return
    resetMessages()
    report.clear()
    restartFrom(form, conflict)
  }

  // A dependent field's message is checked again only once it shows one, as `changeAndRecheck` does.
  function recheckPan() {
    if (form.getFieldMeta('pan_vat_number')?.errorMap.onBlur) {
      void form.validateField('pan_vat_number', 'blur')
    }
  }

  const conflictFields = conflict ? changedFields(base, conflict) : []

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
        <FieldLegend>{t('seller.settings.public_legend')}</FieldLegend>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('seller.settings.name')}</p>
          <p>{shop.name}</p>
          <p className="text-sm font-medium">{t('seller.settings.slug')}</p>
          <p className="break-all">{shop.slug}</p>
          <p className="text-muted-foreground text-sm">{t('seller.settings.name_help')}</p>
        </div>
        <form.Field
          name="description"
          validators={{
            onBlur: ({ value }) =>
              codePoints(value) > descriptionLimit.max
                ? t('seller.settings.description_rule', { max: descriptionLimit.max })
                : undefined,
          }}
        >
          {(field) => (
            <TextareaField
              id="settings-description"
              label={t('seller.settings.description')}
              description={t('seller.settings.description_help', { max: descriptionLimit.max })}
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="contact_email" validators={{ onBlur: ({ value }) => emailError(value) }}>
          {(field) => (
            <TextField
              id="settings-contact-email"
              label={t('seller.settings.contact_email')}
              description={t('seller.settings.contact_help')}
              type="email"
              autoComplete="off"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="contact_phone" validators={{ onBlur: ({ value }) => phoneError(value) }}>
          {(field) => (
            <NepalPhoneInput
              id="settings-contact-phone"
              label={t('seller.settings.contact_phone')}
              description={t('seller.settings.phone_help')}
              autoComplete="off"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => changeAndRecheck(field, value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
      </FieldSet>

      {details && (
        <FieldSet className="gap-5">
          <FieldLegend>{t('seller.settings.business_legend')}</FieldLegend>
          <FieldDescription>{t('seller.settings.owner_only_help')}</FieldDescription>
          <form.Field name="business_type">
            {(field) => (
              <ChoiceField
                id="settings-business-type"
                label={t('seller.settings.business_type')}
                value={field.state.value}
                options={[
                  { value: 'individual', label: t('seller.settings.business_type_individual') },
                  {
                    value: 'registered_business',
                    label: t('seller.settings.business_type_registered'),
                  },
                ]}
                description={t('seller.settings.business_type_help')}
                triggerClassName={TALL}
                errors={field.state.meta.errors}
                onChange={(value) => {
                  if (value === field.state.value) return
                  field.handleChange(value)
                  // The identifier fields go with the type: their messages go too.
                  if (value === 'individual') {
                    for (const name of ['registration_number', 'registration_authority'] as const) {
                      if (!form.getFieldMeta(name)) continue
                      form.setFieldMeta(name, (prev) => ({ ...prev, errorMap: {} }))
                    }
                  }
                  recheckPan()
                }}
              />
            )}
          </form.Field>
          {registered && (
            <>
              <form.Field
                name="registration_number"
                validators={{
                  onBlur: ({ value, fieldApi }) =>
                    fieldApi.form.getFieldValue('business_type') === 'registered_business'
                      ? boundedError(
                          value,
                          numberLimit,
                          t('seller.settings.registration_number_rule', { max: numberLimit.max })
                        )
                      : undefined,
                }}
              >
                {(field) => (
                  <TextField
                    id="settings-registration-number"
                    label={t('seller.settings.registration_number')}
                    autoComplete="off"
                    value={field.state.value}
                    errors={field.state.meta.errors}
                    onChange={(value) => changeAndRecheck(field, value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
              <form.Field
                name="registration_authority"
                validators={{
                  onBlur: ({ value, fieldApi }) =>
                    fieldApi.form.getFieldValue('business_type') === 'registered_business'
                      ? boundedError(
                          value,
                          authorityLimit,
                          t('seller.settings.registration_authority_rule', {
                            min: authorityLimit.min,
                            max: authorityLimit.max,
                          })
                        )
                      : undefined,
                }}
              >
                {(field) => (
                  <TextField
                    id="settings-registration-authority"
                    label={t('seller.settings.registration_authority')}
                    description={t('seller.settings.registration_authority_help')}
                    autoComplete="off"
                    value={field.state.value}
                    errors={field.state.meta.errors}
                    onChange={(value) => changeAndRecheck(field, value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </>
          )}
          <form.Field
            name="pan_vat_number"
            validators={{
              onBlur: ({ value, fieldApi }) => {
                const pan = value.trim()
                const needed =
                  fieldApi.form.getFieldValue('business_type') === 'registered_business' ||
                  fieldApi.form.getFieldValue('is_vat_registered')
                if (pan === '') return needed ? t('seller.settings.pan_required') : undefined
                return panVat.pattern.test(pan) ? undefined : t('seller.settings.pan_rule')
              },
            }}
          >
            {(field) => (
              <TextField
                id="settings-pan-vat-number"
                label={t('seller.settings.pan_vat_number')}
                description={
                  panRequired
                    ? t('seller.settings.pan_help_required')
                    : t('seller.settings.pan_help_optional')
                }
                autoComplete="off"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => changeAndRecheck(field, value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field name="is_vat_registered">
            {(field) => (
              <CheckboxField
                id="settings-is-vat-registered"
                label={t('seller.settings.is_vat_registered')}
                description={t('seller.settings.is_vat_registered_help')}
                checked={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => {
                  field.handleChange(value)
                  recheckPan()
                }}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field
            name="return_policy_text"
            validators={{
              onBlur: ({ value }) =>
                boundedError(
                  value,
                  policyLimit,
                  t('seller.settings.return_policy_rule', { max: policyLimit.max })
                ),
            }}
          >
            {(field) => (
              <TextareaField
                id="settings-return-policy"
                label={t('seller.settings.return_policy_text')}
                description={t('seller.settings.return_policy_help', { max: policyLimit.max })}
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => changeAndRecheck(field, value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </FieldSet>
      )}

      {grievance && (
        <FieldSet className="gap-5">
          <FieldLegend>{t('seller.settings.grievance_legend')}</FieldLegend>
          <FieldDescription>{t('seller.settings.grievance_help')}</FieldDescription>
          <form.Field
            name="grievance_contact_name"
            validators={{
              onBlur: ({ value }) =>
                boundedError(
                  value,
                  grievanceNameLimit,
                  t('seller.settings.grievance_name_rule', {
                    min: grievanceNameLimit.min,
                    max: grievanceNameLimit.max,
                  })
                ),
            }}
          >
            {(field) => (
              <TextField
                id="settings-grievance-name"
                label={t('seller.settings.grievance_contact_name')}
                autoComplete="off"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => changeAndRecheck(field, value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field
            name="grievance_contact_phone"
            validators={{ onBlur: ({ value }) => phoneError(value) }}
          >
            {(field) => (
              <NepalPhoneInput
                id="settings-grievance-phone"
                label={t('seller.settings.grievance_contact_phone')}
                description={t('seller.settings.phone_help')}
                autoComplete="off"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => changeAndRecheck(field, value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </FieldSet>
      )}
      {!details && <p className="text-muted-foreground">{t('seller.settings.owner_only_note')}</p>}

      {conflict && (
        <Alert ref={conflictRef} tabIndex={-1} role="alert" className="outline-none">
          <AlertTitle>{t('seller.settings.conflict_title')}</AlertTitle>
          <AlertDescription>
            <p>{t('seller.settings.conflict_body')}</p>
            {conflictFields.length > 0 && (
              <>
                <p>{t('seller.settings.conflict_fields')}</p>
                <ul className="ml-4 list-disc">
                  {conflictFields.map((label) => (
                    <li key={label}>{label}</li>
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
                {t('seller.settings.conflict_keep')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`h-11 w-full text-base sm:w-auto ${PENDING_BUTTON}`}
                aria-disabled={blocked || undefined}
                onClick={discardAndReload}
              >
                {t('seller.settings.conflict_discard')}
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
              ? t('seller.settings.submitting')
              : t('seller.settings.submit')}
          </Button>
          <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
        </div>
      )}
      {conflict && <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />}
    </form>
  )
}
