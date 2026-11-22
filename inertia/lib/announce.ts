/*
 * Live announcements that are not toasts (docs/08 §7.4, §11.7): the root
 * layout renders two visually hidden live regions in the server HTML
 * (`LiveRegions`), so they exist before any text is written into them, and
 * `announce` writes one message into one of them. Assertive is kept for the
 * interruptions 08 §7.4 lists (a submit blocked by `RATE_LIMITED`, a session
 * expired before a redirect). Browser APIs are used inside the function
 * only, so the module is safe to import in SSR (docs/09 §13.8 rule 1).
 */
export type Politeness = 'polite' | 'assertive'

export const LIVE_REGION_IDS: Record<Politeness, string> = {
  polite: 'live-region-polite',
  assertive: 'live-region-assertive',
}

// Long enough for screen readers to notice the cleared region (08 §11.7 rule 3) [Assumption].
const REWRITE_DELAY_MS = 50

export function announce(message: string, politeness: Politeness = 'polite') {
  const region = document.getElementById(LIVE_REGION_IDS[politeness])
  if (!region) return
  // Cleared first, so the same text written again is read again (08 §11.7 rule 3).
  region.textContent = ''
  window.setTimeout(() => {
    region.textContent = message
  }, REWRITE_DELAY_MS)
}
