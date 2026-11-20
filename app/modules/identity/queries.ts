import db from '@adonisjs/lucid/services/db'
import { maySignIn } from '#modules/identity/domain/user_status'
import {
  ABSOLUTE_SESSION_LIMIT_MS,
  SELLER_IDLE_LIMIT_MS,
  olderThan,
} from '#modules/identity/domain/session_limits'

/*
 * The identity module's reads for other layers (docs/09 §2.2: a module's
 * public surface is `actions/`, `queries.ts` and `events.ts`).
 */

export type AccountStanding = 'valid' | 'suspended' | 'signed_out'

/*
 * The per-request account check of docs/07 §3.3 over the user `silent_auth`
 * has already loaded, so it needs no query of its own. In the 07 §3.3 row
 * order: a user who is not `active` or `pending_verification` is
 * `suspended` (row 1); a session stamp that is missing, not a string or not
 * the user's (row 3), or an `authenticated_at` older than 30 days or missing
 * (row 4), is `signed_out`.
 */
export function accountStanding(
  user: { status: string; securityStamp: string },
  session: { securityStamp: unknown; authenticatedAt: unknown },
  now = Date.now()
): AccountStanding {
  if (!maySignIn(user.status)) return 'suspended'
  const stamp = session.securityStamp
  if (typeof stamp !== 'string' || stamp !== user.securityStamp) return 'signed_out'
  if (olderThan(session.authenticatedAt, ABSOLUTE_SESSION_LIMIT_MS, now)) return 'signed_out'
  return 'valid'
}

/*
 * The seller idle limit of docs/07 §3.4: a session whose `seller_seen_at`
 * is older than 12 hours is idle. A session without one starts the clock at
 * `authenticated_at`; an unreadable value counts as idle. `seller_context`
 * asks only after it has found the caller in the shop.
 */
export function sellerSessionIdle(
  session: { sellerSeenAt: unknown; authenticatedAt: unknown },
  now = Date.now()
): boolean {
  const seenAt = session.sellerSeenAt ?? session.authenticatedAt
  return olderThan(seenAt, SELLER_IDLE_LIMIT_MS, now)
}

/*
 * Whether an account holds `email` (already normalised by the account
 * email rule), for `platform:create-admin`, which asks the operator before
 * granting a role to an existing account (docs/09 §9.1). A host-side
 * command, so the answer reveals nothing to a client.
 */
export async function accountExistsWithEmail(email: string) {
  const row = await db.from('users').where('email', email).select('id').first()
  return row !== null
}

/*
 * Whether an unrevoked `platform_admin` row exists, whatever its user's
 * status: the bootstrap refuses then (docs/09 §9.1). `platform:create-admin`
 * asks before its prompts; its action checks again under its lock.
 */
export async function platformAdminExists() {
  const row = await db
    .from('platform_staff')
    .where('role', 'platform_admin')
    .whereNull('revoked_at')
    .select('user_id')
    .first()
  return row !== null
}
