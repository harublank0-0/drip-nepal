import { useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import type { Problem } from '@shared/api/problem'
import type { DeliveryAreas } from '@shared/ui/shop_shipping'
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
import { PickupAddressForm, type PickupAddress } from '~/components/seller/pickup_address_form'

/*
 * The pickup addresses of `/seller/{shopSlug}/shipping` (docs/08 §2.5: "the
 * live pickup addresses"; 04a §6.6; R1-S part 1c), for members with
 * `shop.shipping.manage` while the shop is `active` (the page leaves the
 * prop out otherwise). The places the courier collects parcels from; the
 * default is the one approval and the overview's "Default pickup address
 * added" item read, and courier booking offers first. The rest of the
 * Courier section (logistics settings, courier accounts) comes with R1-S
 * part 6.
 *
 * - Add and Edit replace the list with `PickupAddressForm`; Cancel brings
 *   the list back and focus to the button that opened the form, and a save
 *   brings it back with a status line and focus on the list's heading.
 * - "Make default" sends `updatePickupAddress` with `is_default: true`.
 * - "Remove" asks first in a tier-1 destructive `ConfirmDialog` (docs/08
 *   §7.3) that says parcels already booked keep it, then sends
 *   `archivePickupAddress`. The default has no Remove: a shop always keeps
 *   one default pickup address (04a §6.6), so another is made the default
 *   first, and the line under it says so; the server refuses it anyway
 *   (409, T-SHOP-115).
 * The list's actions share one request in flight and one `RATE_LIMITED`
 * wait (`api_user`), and reload the `pickup_addresses` prop after each
 * write (docs/09 §13.3 rule 3).
 */
type Mode = { kind: 'list' } | { kind: 'add' } | { kind: 'edit'; address: PickupAddress }

const ADD_BUTTON_ID = 'pickup-add'
const LIST_HEADING_ID = 'pickup-heading'
const RATE_LIMIT_ID = 'pickup-list-rate-limit'

// The name an address goes by in headings and button names.
const titleOf = (address: PickupAddress) => address.label ?? address.contact_name

const reload = () => router.reload({ only: ['pickup_addresses'] })

// Removed, replaced or made the default in another tab meanwhile: the list catches up.
const stale = (problem: Problem) =>
  problem.code === 'NOT_FOUND' || problem.code === 'INVALID_STATE_TRANSITION'

export function PickupAddresses({
  addresses,
  areas,
  slug,
}: {
  addresses: PickupAddress[]
  areas: DeliveryAreas
  slug: string
}) {
  const mutation = useApiMutation()
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [defaulting, setDefaulting] = useState<string | null>(null)
  // The address the Remove dialog is about; it outlives the dialog's closing animation.
  const [removing, setRemoving] = useState<PickupAddress | null>(null)
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

  async function makeDefault(address: PickupAddress) {
    if (mutation.pending) return
    resetMessages()
    setDefaulting(address.id)
    const outcome = await mutation.run(() =>
      client.request('updatePickupAddress', {
        params: { shopSlug: slug, addressId: address.id },
        body: { is_default: true },
        timeout: 30_000,
      })
    )
    setDefaulting(null)
    if (!outcome) return
    if (outcome.ok) {
      setStatus(t('seller.shipping.pickup.now_default', { title: titleOf(address) }))
      reload()
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
    if (stale(outcome.problem)) reload()
  }

  async function remove(address: PickupAddress) {
    setRemoveProblem(null)
    setRemoveOffline(false)
    const outcome = await mutation.run(() =>
      client.request('archivePickupAddress', {
        params: { shopSlug: slug, addressId: address.id },
        timeout: 30_000,
      })
    )
    if (!outcome) return
    if (outcome.ok) {
      closeFocus.current = 'heading'
      setRemoveOpen(false)
      setStatus(t('seller.shipping.pickup.removed', { title: titleOf(address) }))
      reload()
      return
    }
    if ('offline' in outcome) {
      setRemoveOffline(true)
      return
    }
    if (outcome.problem.code === 'RATE_LIMITED') return
    setRemoveProblem(outcome.problem)
    if (stale(outcome.problem)) reload()
  }

  if (mode.kind !== 'list') {
    const saved = mode.kind === 'edit' ? mode.address : null
    return (
      <PickupAddressForm
        areas={areas}
        saved={saved}
        hasAddresses={addresses.length > 0}
        slug={slug}
        onDone={(outcome) => {
          reload()
          backToList(
            outcome === 'created'
              ? t('seller.shipping.pickup.added')
              : t('seller.shipping.pickup.saved'),
            LIST_HEADING_ID
          )
        }}
        onCancel={() => backToList(null, saved ? `pickup-edit-${saved.id}` : ADD_BUTTON_ID)}
      />
    )
  }

  const blocked = mutation.pending || mutation.retryIn > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3
          id={LIST_HEADING_ID}
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-lg font-semibold tracking-tight outline-none"
        >
          {t('seller.shipping.pickup.list_heading')}
        </h3>
        {addresses.length > 0 && (
          <Button
            id={ADD_BUTTON_ID}
            type="button"
            className="h-11 w-full text-base sm:w-auto"
            onClick={() => {
              resetMessages()
              setMode({ kind: 'add' })
            }}
          >
            {t('seller.shipping.pickup.add')}
          </Button>
        )}
      </div>
      {status && (
        <Alert role="status">
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      )}
      <ProblemAlert problem={problem} offline={offline} />
      {addresses.length === 0 ? (
        <EmptyState
          heading={t('seller.shipping.pickup.empty_heading')}
          body={t('seller.shipping.pickup.empty_body')}
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
            {t('seller.shipping.pickup.add')}
          </Button>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {addresses.map((address) => (
            <li key={address.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-heading text-base font-semibold break-words">
                  {titleOf(address)}
                </h4>
                {address.is_default && (
                  <Badge variant="secondary">{t('seller.shipping.pickup.default_badge')}</Badge>
                )}
              </div>
              <div className="space-y-1 text-sm break-words">
                {address.label && <p>{address.contact_name}</p>}
                <p>{t('seller.shipping.pickup.phone', { phone: address.contact_phone })}</p>
                <p>{address.area_tole}</p>
                {address.street_landmark && <p>{address.street_landmark}</p>}
                <p>
                  {t('seller.shipping.pickup.place', {
                    ward: address.ward_no,
                    local_level: address.local_level_name,
                    district: address.district_name,
                    province: address.province_name,
                  })}
                </p>
                <p className="text-muted-foreground">
                  {t('seller.shipping.pickup.postal_code', { code: address.postal_code })}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  id={`pickup-edit-${address.id}`}
                  type="button"
                  variant="outline"
                  className="h-11 text-base sm:h-9 sm:text-sm"
                  aria-label={t('seller.shipping.pickup.edit_label', { title: titleOf(address) })}
                  onClick={() => {
                    resetMessages()
                    setMode({ kind: 'edit', address })
                  }}
                >
                  {t('seller.shipping.pickup.edit')}
                </Button>
                {!address.is_default && (
                  <Button
                    type="button"
                    variant="outline"
                    className={`h-11 text-base sm:h-9 sm:text-sm ${PENDING_BUTTON}`}
                    aria-label={t('seller.shipping.pickup.make_default_label', {
                      title: titleOf(address),
                    })}
                    aria-disabled={blocked || undefined}
                    aria-describedby={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
                    onClick={() => {
                      if (!blocked) void makeDefault(address)
                    }}
                  >
                    {defaulting === address.id
                      ? t('seller.shipping.pickup.making_default')
                      : t('seller.shipping.pickup.make_default')}
                  </Button>
                )}
                {!address.is_default && (
                  <Button
                    id={`pickup-remove-${address.id}`}
                    type="button"
                    variant="outline"
                    className="h-11 text-base sm:h-9 sm:text-sm"
                    aria-label={t('seller.shipping.pickup.remove_label', {
                      title: titleOf(address),
                    })}
                    onClick={() => {
                      resetMessages()
                      setRemoveProblem(null)
                      setRemoveOffline(false)
                      closeFocus.current = 'button'
                      setRemoving(address)
                      setRemoveOpen(true)
                    }}
                  >
                    {t('seller.shipping.pickup.remove')}
                  </Button>
                )}
              </div>
              {address.is_default && (
                <p className="text-muted-foreground text-sm">
                  {t('seller.shipping.pickup.default_note')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* While the dialog is open, the wait shows next to its confirm button instead. */}
      <RateLimitNotice id={RATE_LIMIT_ID} seconds={removeOpen ? 0 : mutation.retryIn} />
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t('seller.shipping.pickup.remove_title')}
        consequence={t('seller.shipping.pickup.remove_consequence', {
          title: removing ? titleOf(removing) : '',
        })}
        confirmLabel={t('seller.shipping.pickup.remove_confirm')}
        pendingLabel={t('seller.shipping.pickup.removing')}
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
              ? document.getElementById(`pickup-remove-${removing.id}`)
              : null
          ;(button ?? headingRef.current)?.focus()
        }}
      >
        <ProblemAlert problem={removeProblem} offline={removeOffline} />
      </ConfirmDialog>
    </div>
  )
}
