import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'
import User from '#models/user'
import { maySignIn } from '#modules/identity/domain/user_status'
import type { UserTokenPurpose } from '#modules/identity/domain/user_token_purpose'
import { activeStaffRole } from '#modules/identity/staff'
import {
  ABSOLUTE_SESSION_LIMIT_MS,
  ADMIN_IDLE_LIMIT_MS,
  SELLER_IDLE_LIMIT_MS,
  STAFF_ABSOLUTE_LIMIT_MS,
  olderThan,
} from '#modules/identity/domain/session_limits'

/*
 * The identity module's reads for other layers (docs/09 §2.2: a module's
 * public surface is `actions/`, `queries.ts` and `events.ts`).
 */

export type AccountStanding = 'valid' | 'suspended' | 'signed_out'

export type { UserTokenPurpose }

// The return-path helper of docs/07 TM-14, a pure function the controllers need (docs/09 §2.1).
export { safeReturnPath } from '#modules/identity/domain/return_path'

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
 * When the session's MFA proof was made, in epoch milliseconds, or null
 * (docs/07 §3.2): `mfa_verified_at` holds `{ user_id, at }`, and counts only
 * when `user_id` is the signed-in user and `at` is not earlier than
 * `authenticated_at`, so one staff member's TOTP check never unlocks another
 * account in the same browser, nor survives into a later sign-in. Anything
 * else (missing, the wrong shape, an unreadable time) is no proof.
 */
export function verifiedMfaTime(
  value: unknown,
  userId: string,
  authenticatedAt: unknown
): number | null {
  if (typeof value !== 'object' || value === null) return null
  const { user_id: owner, at } = value as Record<string, unknown>
  if (owner !== userId || typeof at !== 'string') return null
  const time = Date.parse(at)
  const signedInAt = typeof authenticatedAt === 'string' ? Date.parse(authenticatedAt) : Number.NaN
  if (!Number.isFinite(time) || !Number.isFinite(signedInAt) || time < signedInAt) return null
  return time
}

/*
 * The admin surface's session limits (docs/07 §3.4), in the order the
 * `platform_staff` middleware checks them after its 404 (07 §3.4 "Compare,
 * then refresh"): `expired` past the 7-day staff limit from
 * `authenticated_at` (proposed); `idle` more than 2 hours after
 * `admin_seen_at`; `unverified` without an MFA proof from the last
 * `windowMs` (12 hours for the admin surface). A missing timestamp never
 * means "no limit" (07 §3.2).
 */
export type AdminStanding = 'valid' | 'expired' | 'idle' | 'unverified'

export function adminStanding(
  session: { authenticatedAt: unknown; adminSeenAt: unknown; mfaVerifiedAt: unknown },
  userId: string,
  windowMs: number,
  now = Date.now()
): AdminStanding {
  if (olderThan(session.authenticatedAt, STAFF_ABSOLUTE_LIMIT_MS, now)) return 'expired'
  if (olderThan(session.adminSeenAt, ADMIN_IDLE_LIMIT_MS, now)) return 'idle'
  const verified = verifiedMfaTime(session.mfaVerifiedAt, userId, session.authenticatedAt)
  if (verified === null || now - verified > windowMs) return 'unverified'
  return 'valid'
}

/*
 * The signed-in user's own account as `getMe` shows it (docs/06 §13.3):
 * the profile, the status, the two marketing consents as booleans (as
 * `updateMe` takes them), the phone's last four digits, and the staff role
 * of an unrevoked `platform_staff` row, enrolled or not. Never the password
 * hash, the security stamp, the TOTP secret, the encrypted phone or its
 * blind index (docs/07 §5.5). Null for a missing row.
 */
export type OwnAccount = {
  id: string
  email: string
  fullName: string | null
  status: string
  phoneLast4: string | null
  marketingEmailConsent: boolean
  marketingSmsConsent: boolean
  staffRole: string | null
}

export async function ownAccount(userId: string): Promise<OwnAccount | null> {
  const row = await db
    .from('users')
    .leftJoin('platform_staff', (join) => {
      join.on('platform_staff.user_id', 'users.id').andOnNull('platform_staff.revoked_at')
    })
    .where('users.id', userId)
    .select(
      'users.id',
      'users.email',
      'users.full_name',
      'users.status',
      'users.phone_last4',
      'users.marketing_email_consent_at',
      'users.marketing_sms_consent_at',
      'platform_staff.role'
    )
    .first()
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    phoneLast4: row.phone_last4,
    marketingEmailConsent: row.marketing_email_consent_at !== null,
    marketingSmsConsent: row.marketing_sms_consent_at !== null,
    staffRole: row.role,
  }
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
 * The account an operator names by email (already normalised by the
 * account email rule) for `platform:create-shop` (docs/09 §9.8): its ID and
 * status, read inside the caller's transaction with the row locked
 * `FOR NO KEY UPDATE`, the owner's row lock under which a shop is created
 * for that owner (docs/04a §6.1, shop-count rule). Null when no account
 * holds the email. A host-side command, so the answer reveals nothing to a
 * client.
 */
export type NamedAccount = { userId: string; status: string }

export async function lockAccountByEmail(
  trx: TransactionClientContract,
  email: string
): Promise<NamedAccount | null> {
  const result = await trx.rawQuery(
    'SELECT id, status FROM users WHERE email = ? FOR NO KEY UPDATE',
    [email]
  )
  const row = result.rows[0]
  return row ? { userId: row.id, status: row.status } : null
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

/*
 * The caller's address book (docs/04a §5.5; 06 §13.4 `listAddresses`; 07
 * §4.6): the owner condition and `archived_at IS NULL` are part of the query,
 * so another user's or an archived address is simply not found (T-SEC-006).
 * The default first, then the oldest first, the order of
 * `user_addresses_user_active_idx`. The encrypted members stay ciphertext:
 * only the address transformer decrypts them (07 §5.5, T-SEC-034). The
 * phone's ciphertext is not selected at all: an address is shown with the
 * last four digits only (AC-FR-IAM-012-5).
 */
export type AddressRow = {
  id: string
  label: string | null
  recipient_name_enc: string
  recipient_phone_last4: string
  province_code: string
  district_code: string
  local_level_code: string
  ward_no: number
  area_tole_enc: string
  street_landmark_enc: string | null
  postal_code: string
  is_default: boolean
}

const ADDRESS_COLUMNS = [
  'id',
  'label',
  'recipient_name_enc',
  'recipient_phone_last4',
  'province_code',
  'district_code',
  'local_level_code',
  'ward_no',
  'area_tole_enc',
  'street_landmark_enc',
  'postal_code',
  'is_default',
] as const

export async function ownAddresses(userId: string): Promise<AddressRow[]> {
  return db
    .from('user_addresses')
    .where('user_id', userId)
    .whereNull('archived_at')
    .orderBy('is_default', 'desc')
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .select(...ADDRESS_COLUMNS)
}

// One active address of the caller, or null for a missing, foreign or archived ID.
export async function ownAddress(
  userId: string,
  addressId: string,
  options: { client?: QueryClientContract } = {}
): Promise<AddressRow | null> {
  const client: QueryClientContract = options.client ?? db.connection()
  const row = await client
    .from('user_addresses')
    .where({ id: addressId, user_id: userId })
    .whereNull('archived_at')
    .select(...ADDRESS_COLUMNS)
    .first()
  return row ?? null
}
