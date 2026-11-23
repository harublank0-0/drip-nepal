import { useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import type { Problem } from '@shared/api/problem'
import { ADDRESS_LIMITS } from '@shared/constants/limits'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { ConfirmDialog } from '~/components/common/confirm_dialog'
import { EmptyState } from '~/components/common/empty_state'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'
import { AddressForm, type Place, type SavedAddress } from '~/components/account/address_form'

/*
 * The address book of `/account/addresses` (docs/08 §2.4, §3.1
 * "Addresses": add, edit, set default, archive; 01 FR-IAM-012,
 * AC-FR-IAM-012-4, -5). The list shows each address with its default
 * badge, the phone's last four digits only, and its place by name; the
 * default comes first, as `listAddresses` orders them.
 *
 * - Add and Edit replace the list with `AddressForm`; Cancel brings the
 *   list back and focus to the button that opened the form, and a save
 *   brings it back with a status line and focus on the list's heading.
 * - "Make default" sends `updateAddress` with `is_default: true` at once:
 *   it moves the default and loses nothing.
 * - "Remove" asks first in a tier-1 destructive `ConfirmDialog` (docs/08
 *   §7.3) that says past orders keep their copy, then sends
 *   `deleteAddress`, which archives the address; if it was the default,
 *   the newest remaining address becomes the default (04a §5.5).
 * - At 10 addresses [Assumption, AC-FR-IAM-012-4] "Add an address" gives
 *   way to a line that says why; the server refuses an 11th anyway.
 *
 * After each write the page reloads its props (docs/09 §13.3 rule 3). The
 * list's two actions share one request in flight and one `RATE_LIMITED`
 * wait (`api_user`), shown under the list.
 */
type Mode = { kind: 'list' } | { kind: 'add' } | { kind: 'edit'; address: SavedAddress }

const ADD_BUTTON_ID = 'address-add'
const LIST_HEADING_ID = 'addresses-heading'
const RATE_LIMIT_ID = 'addresses-rate-limit'

// The name an address goes by in headings and button names.
const titleOf = (address: SavedAddress) => address.label ?? address.recipient_name

export function AddressBook({
  addresses,
  provinces,
}: {
  addresses: SavedAddress[]
  provinces: Place[]
}) {
  const mutation = useApiMutation()
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [defaulting, setDefaulting] = useState<string | null>(null)
  // The address the Remove dialog is about; it outlives the dialog's closing animation.
  const [removing, setRemoving] = useState<SavedAddress | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  // Where the dialog sends focus as it closes: back to its Remove button, or the heading after a removal.
  const closeFocus = useRef<'button' | 'heading'>('button')
  const [removeProblem, setRemoveProblem] = useState<Problem | null>(null)
  const [removeOffline, setRemoveOffline] = useState(false)
  // Where focus goes once the list is back: an element's id, or the list's heading.
  const [focusTarget, setFocusTarget] = useState<{ id: string; turn: number } | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!focusTarget) return
    const target = document.getElementById(focusTarget.id)
    ;(target ?? headingRef.current)?.focus()
  }, [focusTarget])

  function focusAfter(id: string) {
    setFocusTarget((previous) => ({ id, turn: (previous?.turn ?? 0) + 1 }))
  }

  function resetMessages() {
    setStatus(null)
    setProblem(null)
    setOffline(false)
  }

  function backToList(message: string | null, focusId: string) {
    setMode({ kind: 'list' })
    setStatus(message)
    focusAfter(focusId)
  }

  async function makeDefault(address: SavedAddress) {
    if (mutation.pending) return
    resetMessages()
    setDefaulting(address.id)
    const outcome = await mutation.run(() =>
      client.request('updateAddress', {
        params: { addressId: address.id },
        body: { is_default: true },
        timeout: 30_000,
      })
    )
    setDefaulting(null)
    if (!outcome) return
    if (outcome.ok) {
      setStatus(t('account.addresses.now_default', { title: titleOf(address) }))
      router.reload({ only: ['addresses'] })
      focusAfter(LIST_HEADING_ID)
      return
    }
    if ('offline' in outcome) {
      setOffline(true)
      return
    }
    // useApiMutation shows the wait under the list.
    if (outcome.problem.code === 'RATE_LIMITED') return
    setProblem(outcome.problem)
    // Removed in another tab meanwhile: the list catches up.
    if (outcome.problem.code === 'NOT_FOUND') router.reload({ only: ['addresses'] })
  }

  async function remove(address: SavedAddress) {
    setRemoveProblem(null)
    setRemoveOffline(false)
    const outcome = await mutation.run(() =>
      client.request('deleteAddress', { params: { addressId: address.id }, timeout: 30_000 })
    )
    if (!outcome) return
    if (outcome.ok) {
      closeFocus.current = 'heading'
      setRemoveOpen(false)
      setStatus(t('account.addresses.removed', { title: titleOf(address) }))
      router.reload({ only: ['addresses'] })
      return
    }
    if ('offline' in outcome) {
      setRemoveOffline(true)
      return
    }
    if (outcome.problem.code === 'RATE_LIMITED') return
    setRemoveProblem(outcome.problem)
    if (outcome.problem.code === 'NOT_FOUND') router.reload({ only: ['addresses'] })
  }

  if (mode.kind !== 'list') {
    const saved = mode.kind === 'edit' ? mode.address : null
    return (
      <AddressForm
        provinces={provinces}
        saved={saved}
        hasAddresses={addresses.length > 0}
        onDone={(outcome) => {
          router.reload({ only: ['addresses'] })
          backToList(
            outcome === 'created' ? t('account.addresses.added') : t('account.addresses.saved'),
            LIST_HEADING_ID
          )
        }}
        onCancel={() => backToList(null, saved ? `address-edit-${saved.id}` : ADD_BUTTON_ID)}
      />
    )
  }

  const full = addresses.length >= ADDRESS_LIMITS.maxActive
  const blocked = mutation.pending || mutation.retryIn > 0

  return (
    <section aria-labelledby={LIST_HEADING_ID} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id={LIST_HEADING_ID}
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-xl font-semibold tracking-tight outline-none"
        >
          {t('account.addresses.list_heading')}
        </h2>
        {!full && addresses.length > 0 && (
          <Button
            id={ADD_BUTTON_ID}
            type="button"
            className="h-11 w-full text-base sm:w-auto"
            onClick={() => {
              resetMessages()
              setMode({ kind: 'add' })
            }}
          >
            {t('account.addresses.add')}
          </Button>
        )}
      </div>
      {full && (
        <p className="text-muted-foreground text-sm">
          {t('account.addresses.limit_reached', { max: ADDRESS_LIMITS.maxActive })}
        </p>
      )}
      {status && (
        <Alert role="status">
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      )}
      <ProblemAlert problem={problem} offline={offline} />
      {addresses.length === 0 ? (
        <EmptyState
          heading={t('account.addresses.empty_heading')}
          body={t('account.addresses.empty_body')}
        >
          <Button
            id={ADD_BUTTON_ID}
            type="button"
            className="h-11 text-base"
            onClick={() => {
              resetMessages()
              setMode({ kind: 'add' })
            }}
          >
            {t('account.addresses.add')}
          </Button>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {addresses.map((address) => (
            <li key={address.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-base font-semibold break-words">
                  {titleOf(address)}
                </h3>
                {address.is_default && (
                  <Badge variant="secondary">{t('account.addresses.default_badge')}</Badge>
                )}
              </div>
              <div className="space-y-1 text-sm break-words">
                {address.label && <p>{address.recipient_name}</p>}
                <p>{t('account.addresses.phone', { last4: address.recipient_phone_last4 })}</p>
                <p>{address.area_tole}</p>
                {address.street_landmark && <p>{address.street_landmark}</p>}
                <p>
                  {t('account.addresses.place', {
                    ward: address.ward_no,
                    local_level: address.local_level_name,
                    district: address.district_name,
                    province: address.province_name,
                  })}
                </p>
                <p className="text-muted-foreground">
                  {t('account.addresses.postal_code', { code: address.postal_code })}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  id={`address-edit-${address.id}`}
                  type="button"
                  variant="outline"
                  className="h-11 text-base sm:h-9 sm:text-sm"
                  aria-label={t('account.addresses.edit_label', { title: titleOf(address) })}
                  onClick={() => {
                    resetMessages()
                    setMode({ kind: 'edit', address })
                  }}
                >
                  {t('account.addresses.edit')}
                </Button>
                {!address.is_default && (
                  <Button
                    type="button"
                    variant="outline"
                    className={`h-11 text-base sm:h-9 sm:text-sm ${PENDING_BUTTON}`}
                    aria-label={t('account.addresses.make_default_label', {
                      title: titleOf(address),
                    })}
                    aria-disabled={blocked || undefined}
                    aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
                    onClick={() => {
                      if (!blocked) void makeDefault(address)
                    }}
                  >
                    {defaulting === address.id
                      ? t('account.addresses.making_default')
                      : t('account.addresses.make_default')}
                  </Button>
                )}
                <Button
                  id={`address-remove-${address.id}`}
                  type="button"
                  variant="outline"
                  className="h-11 text-base sm:h-9 sm:text-sm"
                  aria-label={t('account.addresses.remove_label', { title: titleOf(address) })}
                  onClick={() => {
                    resetMessages()
                    setRemoveProblem(null)
                    setRemoveOffline(false)
                    closeFocus.current = 'button'
                    setRemoving(address)
                    setRemoveOpen(true)
                  }}
                >
                  {t('account.addresses.remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {/* While the dialog is open, the wait shows next to its confirm button instead. */}
      <RateLimitNotice id={RATE_LIMIT_ID} seconds={removeOpen ? 0 : mutation.retryIn} />
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t('account.addresses.remove_title')}
        consequence={t('account.addresses.remove_consequence', {
          title: removing ? titleOf(removing) : '',
        })}
        confirmLabel={t('account.addresses.remove_confirm')}
        pendingLabel={t('account.addresses.removing')}
        pending={mutation.pending}
        retryIn={mutation.retryIn}
        onConfirm={() => {
          if (removing) void remove(removing)
        }}
        onCloseAutoFocus={(event) => {
          // A dialog opened by a button whose row may be gone: say where focus goes (08 §7.3 rule 1).
          event.preventDefault()
          const button =
            closeFocus.current === 'button' && removing
              ? document.getElementById(`address-remove-${removing.id}`)
              : null
          ;(button ?? headingRef.current)?.focus()
        }}
      >
        <ProblemAlert problem={removeProblem} offline={removeOffline} />
      </ConfirmDialog>
    </section>
  )
}
