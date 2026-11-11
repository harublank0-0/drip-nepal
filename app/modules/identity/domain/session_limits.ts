/*
 * Session time limits owned by docs/07 §3.4 [Assumption A-23]. The values
 * are checked by middleware from timestamps in the session (docs/07 §3.2),
 * because the session store has one idle `age` for every signed-in session.
 */

// Every session with a user: 30 days from `authenticated_at` (docs/07 §3.3 row 4).
export const ABSOLUTE_SESSION_LIMIT_MS = 30 * 24 * 60 * 60 * 1000

/*
 * Whether a session timestamp is older than `limitMs`. Timestamps are ISO
 * 8601 strings in UTC. A missing or unreadable value never means "no
 * limit": it counts as expired (docs/07 §3.2).
 */
export function olderThan(at: unknown, limitMs: number, now = Date.now()): boolean {
  if (typeof at !== 'string') return true
  const time = Date.parse(at)
  if (!Number.isFinite(time)) return true
  return now - time > limitMs
}
