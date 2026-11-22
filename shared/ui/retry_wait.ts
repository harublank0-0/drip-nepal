/*
 * The wait after 429 `RATE_LIMITED` (docs/08 §8.3, AC-J00-04): the action
 * stays disabled until `Retry-After` has passed, and the form says how long
 * is left. Pure, so the rules are tested without a browser (T-UI-037).
 */

// When a 429 carries no usable `retry_after_seconds` [Assumption: every limiter of
// docs/06 §9.1 sends one, so this is a fallback, not a value of any limiter].
export const FALLBACK_RETRY_SECONDS = 60

/** The whole seconds to wait for a problem's `retry_after_seconds`: at least 1. */
export function retryWaitSeconds(retryAfter: unknown): number {
  if (typeof retryAfter !== 'number' || !Number.isFinite(retryAfter) || retryAfter <= 0) {
    return FALLBACK_RETRY_SECONDS
  }
  return Math.max(1, Math.ceil(retryAfter))
}

/** Whole seconds left until `until` (epoch milliseconds) at `now`; 0 once it has passed. */
export function secondsUntil(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000))
}

/*
 * How a wait reads: seconds under a minute, else whole minutes rounded up,
 * so "Try again in 40 seconds" and "Try again in 47 minutes", never a time
 * shorter than the real wait. The catalog message picks the unit (`select`)
 * and the plural.
 */
export type WaitText = { unit: 'seconds' | 'minutes'; count: number }

export function waitText(seconds: number): WaitText {
  const whole = Math.max(0, Math.ceil(seconds))
  if (whole < 60) return { unit: 'seconds', count: whole }
  return { unit: 'minutes', count: Math.ceil(whole / 60) }
}
