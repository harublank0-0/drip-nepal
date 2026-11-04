import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { router, usePage } from '@inertiajs/react'

const POLL_INTERVAL_MS = 60_000
const PREFERENCE_KEY = 'drip-order-alerts'
const TITLE_PREFIX = /^\(\d+\)\s/
// Pages that show order counts or lists from their own props.
const PAGES_WITH_ORDERS = new Set(['shops/dashboard/index', 'shops/dashboard/orders/index'])

export type OrderAlerts = {
  /** Orders waiting for the shop to confirm them; null until first loaded. */
  pending: number | null
  /** Sound and desktop notifications are on in this browser. */
  alertsOn: boolean
  /** Desktop notifications are allowed by the browser. */
  notificationsAllowed: boolean
  enableAlerts: () => Promise<void>
  disableAlerts: () => void
}

/*
 * A short two-note chime, made in the browser so no audio file is needed.
 */
function chime(context: AudioContext | null) {
  if (!context || context.state !== 'running') return
  const start = context.currentTime
  for (const [index, frequency] of [880, 1320].entries()) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, start + index * 0.18)
    gain.gain.exponentialRampToValueAtTime(0.25, start + index * 0.18 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.18 + 0.3)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start + index * 0.18)
    oscillator.stop(start + index * 0.18 + 0.32)
  }
}

function readPreference() {
  try {
    return localStorage.getItem(PREFERENCE_KEY) === 'on'
  } catch {
    return false
  }
}

const PREFERENCE_EVENT = 'drip-order-alerts-change'

function writePreference(on: boolean) {
  try {
    localStorage.setItem(PREFERENCE_KEY, on ? 'on' : 'off')
  } catch {}
  window.dispatchEvent(new Event(PREFERENCE_EVENT))
}

function subscribeToPreference(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(PREFERENCE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(PREFERENCE_EVENT, onChange)
  }
}

function notificationsGranted() {
  return typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission === 'granted'
    : false
}

/*
 * The seller dashboard's new-order indicator (FR-NOT-003). While the tab is
 * visible it asks the server every 60 seconds how many orders wait for
 * confirmation, stops while the tab is hidden, and asks again as soon as
 * it is visible and after each page visit (so confirming an order updates
 * it at once). The count goes into the tab title. When it changes, the
 * dashboard and order list reload their data. When it rises and alerts
 * are on, it plays a chime and shows a desktop notification; the
 * notification carries no customer data.
 *
 * Browsers only allow sound after the person interacts with the page, so
 * turning alerts on is a click, and after a reload the first click or key
 * press re-arms the sound.
 */
export function useOrderAlerts(shopSlug: string | undefined): OrderAlerts {
  const { component } = usePage()
  const [pending, setPending] = useState<number | null>(null)
  // Saved in this browser; read like the theme (no server value, no mismatch).
  const alertsOn = useSyncExternalStore(subscribeToPreference, readPreference, () => false)
  // Re-read on every render; enabling alerts re-renders after asking.
  const [, setPermissionAsked] = useState(0)
  const notificationsAllowed = notificationsGranted()
  const previous = useRef<number | null>(null)
  const audio = useRef<AudioContext | null>(null)

  const armSound = useCallback(async () => {
    try {
      audio.current ??= new AudioContext()
      if (audio.current.state === 'suspended') await audio.current.resume()
    } catch {}
  }, [])

  const check = useCallback(async () => {
    if (!shopSlug || document.visibilityState !== 'visible') return
    try {
      const response = await fetch(`/api/v1/shops/${shopSlug}/orders/awaiting`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })
      if (!response.ok) return
      const body = (await response.json()) as { pending: number }
      setPending(body.pending)
    } catch {}
  }, [shopSlug])

  useEffect(() => {
    if (!shopSlug) return
    const first = window.setTimeout(() => void check(), 0)
    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const stopListening = router.on('success', () => void check())
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      stopListening()
    }
  }, [shopSlug, check])

  // After a reload, the first interaction re-arms the sound.
  useEffect(() => {
    if (!alertsOn) return
    const arm = () => void armSound()
    window.addEventListener('pointerdown', arm, { once: true })
    window.addEventListener('keydown', arm, { once: true })
    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
    }
  }, [alertsOn, armSound])

  useEffect(() => {
    if (pending === null) return
    const before = previous.current
    previous.current = pending
    if (before === null || pending === before) return
    // This page's own counts and lists were loaded before the change.
    if (PAGES_WITH_ORDERS.has(component)) router.reload()
    if (pending < before || !alertsOn) return

    chime(audio.current)
    if ('Notification' in window && Notification.permission === 'granted') {
      const added = pending - before
      const notification = new Notification('New order', {
        body: `${added} new order${added === 1 ? '' : 's'}: ${pending} waiting for you to confirm.`,
        tag: 'drip-new-order',
      })
      notification.onclick = () => {
        window.focus()
        if (shopSlug) window.location.assign(`/shops/${shopSlug}/orders?status=pending`)
      }
    }
  }, [pending, alertsOn, shopSlug, component])

  // "(2) Orders – Drip Nepal": kept when a page changes the title. Inertia
  // replaces the <title> element on each visit, so watch the whole <head>.
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(TITLE_PREFIX, '')
      const next = pending ? `(${pending}) ${base}` : base
      if (document.title !== next) document.title = next
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.head, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, [pending])

  const enableAlerts = useCallback(async () => {
    await armSound()
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
      setPermissionAsked((count) => count + 1)
    }
    writePreference(true)
    chime(audio.current)
  }, [armSound])

  const disableAlerts = useCallback(() => {
    writePreference(false)
  }, [])

  return { pending, alertsOn, notificationsAllowed, enableAlerts, disableAlerts }
}
