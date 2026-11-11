import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { hmacKeys } from '#config/crypto'
import { InvariantViolation } from '#exceptions/programming_errors'
import { ipHash, keyedHash } from '#modules/platform/crypto/keyed_hash'
import type { ActorType } from '#modules/audit/domain/actor_type'
import {
  isPersonalIdentifier,
  maskPersonalText,
  personalValueIn,
} from '#modules/audit/domain/personal_values'

/*
 * The `audit_logs` writer (docs/04a §15.3, docs/03 §4.4): a step action
 * that inserts one row inside the caller's transaction, so the row exists
 * only if the change it records commits (AC-J00-09). The table is
 * insert-only for every role (`audit_logs_no_update_delete`).
 *
 * Personal values never reach the row (T-SEC-102): a `changes` member that
 * is a personal column (snake_case or camelCase), a string or number in
 * `changes` that holds an email address or a phone number, and an email or
 * phone number in `subject_id` or `actor_role` are programming errors and
 * throw before anything is written. In the free-text `reason`, emails and
 * mobile numbers are masked; names cannot be detected there.
 */

export type AuditValue =
  | string
  | number
  | boolean
  | null
  | AuditValue[]
  | { [member: string]: AuditValue }

export type AuditEntry = {
  actorType: ActorType
  // Required for `shop_member` and `platform_staff` (`audit_logs_actor_check`).
  actorUserId?: string | null
  // `platform:<role>` or `shop:<shop_id>:<role>`, the role at the time.
  actorRole?: string | null
  // `<subject>.<verb>`, such as `shop.suspend` or `auth.login_failed`.
  action: string
  subjectType: string
  subjectId: string
  shopId?: string | null
  requestId?: string | null
  // From `auditIpHash()`, never the address.
  ipHash?: Buffer | null
  // Before and after values of non-personal columns; personal ones by name in `changed`.
  changes?: { [member: string]: AuditValue }
  reason?: string | null
}

// The keyed hash of the client IP: 32 bytes, the same as the access line's.
export function auditIpHash(ip: string | null | undefined): Buffer | null {
  return ip ? ipHash(hmacKeys.auditIp.release(), ip) : null
}

/*
 * The `subject_id` of an authentication event for an email that matches no
 * account: the hex HMAC of `email:` and the normalised email, keyed like
 * the IP hash. 64 characters whatever the email's length.
 */
export function auditEmailSubject(email: string) {
  const normalised = email.trim().toLowerCase()
  return keyedHash(hmacKeys.auditIp.release(), `email:${normalised}`).toString('hex')
}

export async function recordAudit(trx: TransactionClientContract, entry: AuditEntry) {
  for (const [column, value] of [
    ['subject_id', entry.subjectId],
    ['actor_role', entry.actorRole],
  ] as const) {
    if (value && isPersonalIdentifier(value)) {
      throw new InvariantViolation(
        `audit ${entry.action}: ${column} holds an email address or phone number; use an id or auditEmailSubject()`
      )
    }
  }
  const changes = entry.changes ?? {}
  const personal = personalValueIn(changes)
  if (personal) {
    throw new InvariantViolation(
      `audit ${entry.action}: ${personal} holds a personal value; record the column in changes.changed`
    )
  }

  await trx
    .insertQuery()
    .table('audit_logs')
    .insert({
      actor_type: entry.actorType,
      actor_user_id: entry.actorUserId ?? null,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      subject_type: entry.subjectType,
      subject_id: entry.subjectId,
      shop_id: entry.shopId ?? null,
      request_id: entry.requestId ?? null,
      ip_hash: entry.ipHash ?? null,
      changes: JSON.stringify(changes),
      reason: entry.reason ? maskPersonalText(entry.reason) : null,
    })
}
