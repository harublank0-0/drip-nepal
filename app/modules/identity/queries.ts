import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import User from '#models/user'
import { maySignIn } from '#modules/identity/domain/user_status'
import type { UserTokenPurpose } from '#modules/identity/domain/user_token_purpose'
import { activeStaffRole } from '#modules/identity/staff'
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

export type { UserTokenPurpose }

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
 * A `user_tokens` row as its email needs it, for the notification jobs
 * (docs/07 §3.8, docs/09 §2.3 item 7): the purpose, the token's lifetime,
 * the recipient and the address, and whether the link can still be
 * redeemed. It cannot once the row is consumed or expired, or once its user
 * is no longer `active` or `pending_verification`: a suspension or an
 * anonymisation invalidates every token (07 §3.8). Never the token hash.
 * Null for a missing row. `client` reads inside the caller's transaction
 * (docs/09 §3.9).
 */
export type TokenEmail = {
  id: string
  userId: string
  purpose: UserTokenPurpose
  email: string
  lifetimeSeconds: number
  usable: boolean
}

export async function tokenEmail(
  tokenId: string,
  options: { client?: QueryClientContract } = {}
): Promise<TokenEmail | null> {
  const client: QueryClientContract = options.client ?? db.connection()
  const result = await client.rawQuery(
    `SELECT t.id, t.user_id, t.purpose, u.email, u.status,
            extract(epoch FROM t.expires_at - t.created_at)::int AS lifetime_seconds,
            (t.consumed_at IS NULL AND t.expires_at > now()) AS unexpired
       FROM user_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.id = ?`,
    [tokenId]
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    purpose: row.purpose,
    email: row.email,
    lifetimeSeconds: row.lifetime_seconds,
    usable: row.unexpired === true && maySignIn(row.status),
  }
}

/*
 * An account's address as an email without a token needs it, for the
 * notification jobs (docs/09 §2.3 item 7): today the "account already
 * exists" notice of `signUp` (AC-FR-IAM-001-2). `reachable` is false once
 * the account is anonymised, whose address is a placeholder in the
 * reserved `.invalid` domain (docs/04a §5.1). Null for a missing row.
 * `client` reads inside the caller's transaction (docs/09 §3.9).
 */
export type AccountEmail = { userId: string; email: string; reachable: boolean }

export async function accountEmail(
  userId: string,
  options: { client?: QueryClientContract } = {}
): Promise<AccountEmail | null> {
  const client: QueryClientContract = options.client ?? db.connection()
  const row = await client.from('users').where('id', userId).select('id', 'email', 'status').first()
  if (!row) return null
  return { userId: row.id, email: row.email, reachable: row.status !== 'anonymized' }
}

/*
 * The development-only sign-in (docs/07 §3.13). Its routes exist only
 * outside production, but these reads ship with the module. The demo
 * accounts' addresses are under `.invalid` (docs/09 §8.8), so no seeded
 * address reaches a real inbox.
 */
export const DEMO_EMAIL_DOMAIN = 'dev.dripnepal.invalid'

const ACTIVE_STAFF = `EXISTS (SELECT 1 FROM platform_staff s
  WHERE s.user_id = users.id AND s.revoked_at IS NULL)`

// Guard 3: an active account that is a demo account, or staff with TOTP enrolled.
const MAY_DEV_SIGN_IN = `users.status = 'active' AND (users.email LIKE ?
  OR (users.mfa_enabled_at IS NOT NULL AND ${ACTIVE_STAFF}))`

const demoPattern = () => `%@${DEMO_EMAIL_DOMAIN}`

export type DevSignInAccount = {
  id: string
  email: string
  fullName: string | null
  staffRole: string | null
}

/** The accounts the development-only sign-in offers, staff first. */
export async function devSignInAccounts(): Promise<DevSignInAccount[]> {
  const rows = await db
    .from('users')
    .leftJoin('platform_staff', (join) => {
      // A staff role counts only with TOTP, as the sign-in's staff check does.
      join
        .on('platform_staff.user_id', 'users.id')
        .andOnNull('platform_staff.revoked_at')
        .andOnNotNull('users.mfa_enabled_at')
    })
    .whereRaw(MAY_DEV_SIGN_IN, [demoPattern()])
    .orderByRaw('platform_staff.role NULLS LAST, users.email')
    .select('users.id', 'users.email', 'users.full_name', 'platform_staff.role')
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    staffRole: row.role,
  }))
}

/** Active staff accounts without TOTP, which the sign-in cannot open until `db:seed` runs. */
export async function staffWithoutTotpCount() {
  const row = await db
    .from('users')
    .where('users.status', 'active')
    .whereNull('users.mfa_enabled_at')
    .whereRaw(ACTIVE_STAFF)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

/**
 * The account the development-only sign-in may sign in as, with whether it
 * is staff with TOTP enrolled, or null for any other ID (guard 3).
 */
export async function devSignInUser(id: string) {
  const user = await User.query().where('id', id).whereRaw(MAY_DEV_SIGN_IN, [demoPattern()]).first()
  if (!user) return null
  const staff = user.mfaEnabledAt !== null && (await activeStaffRole(user.id)) !== null
  return { user, staff }
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
