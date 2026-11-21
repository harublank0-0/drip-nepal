import { createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError } from '#exceptions/domain_error'
import { withTx, type TxOptions } from '#modules/platform/tx'

/*
 * Idempotency keys of docs/06 §7 on `idempotency_keys` (docs/04a §15.2). The
 * key row is the first statement of the business transaction; the response
 * is written to it before the commit, so a request either did everything and
 * stored its answer, or did nothing. A second request with the same key:
 * - while the first still runs, waits on the row up to the 5 s lock timeout,
 *   then answers 409 `IDEMPOTENCY_IN_PROGRESS` with `Retry-After: 2`;
 * - after it, gets the stored answer again when its fingerprint matches, and
 *   422 `IDEMPOTENCY_KEY_REUSED` when it does not.
 * A row past `expires_at` that the purge has not deleted yet counts as gone.
 * The stored body never holds a secret: callers store the transformed
 * resource, which never carries credentials (docs/06 §7.5, T-SEC-040).
 */

export type IdempotencyScope = {
  // The caller's user ID, `provider:<code>` or `system` (idempotency_keys_actor_scope_check).
  actorScope: string
  // The operationId of docs/06 §13.
  operation: string
  key: string
  fingerprint: Buffer
  ttlHours?: 24 | 72
}

export type IdempotentResponse<T> = { status: number; body: T; replayed: boolean }

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/

// The canonical request a key's fingerprint covers (docs/06 §7.2), as SHA-256.
export function requestFingerprint(parts: {
  method: string
  route: string
  params: Record<string, string>
  body: unknown
  ifMatch?: string | null
}): Buffer {
  return createHash('sha256').update(canonicalJson(parts)).digest()
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, member]) => member !== undefined && key !== 'totp_code')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

class ReplayRequested extends Error {
  constructor() {
    super('idempotency key already used')
    this.name = 'ReplayRequested'
  }
}

/*
 * Runs `work` in one `withTx` transaction behind the key of `scope`, or, with
 * no scope, as a plain transaction. `work` returns the HTTP status and the
 * response body (already transformed), which are stored with the key.
 */
export async function idempotentTx<T>(
  scope: IdempotencyScope | null,
  work: (trx: TransactionClientContract) => Promise<{ status: number; body: T }>,
  options: TxOptions = {}
): Promise<IdempotentResponse<T>> {
  if (!scope) {
    const result = await withTx(work, options)
    return { ...result, replayed: false }
  }
  try {
    const result = await withTx(async (trx) => {
      await claimKey(trx, scope)
      const answer = await work(trx)
      await trx
        .from('idempotency_keys')
        .where({ actor_scope: scope.actorScope, operation: scope.operation, key: scope.key })
        .update({
          response_status: answer.status,
          response_body: JSON.stringify(answer.body ?? {}),
        })
      return answer
    }, options)
    return { ...result, replayed: false }
  } catch (error) {
    if (!(error instanceof ReplayRequested)) throw error
    return replay<T>(scope)
  }
}

async function claimKey(trx: TransactionClientContract, scope: IdempotencyScope) {
  const ttl = scope.ttlHours ?? 24
  await trx
    .from('idempotency_keys')
    .where({ actor_scope: scope.actorScope, operation: scope.operation, key: scope.key })
    .where('expires_at', '<=', trx.raw('now()'))
    .delete()
  let inserted: { rows: unknown[] }
  try {
    inserted = await trx.rawQuery(
      `INSERT INTO idempotency_keys (actor_scope, operation, key, fingerprint, status,
         response_status, response_body, created_at, expires_at)
       VALUES (?, ?, ?, ?, 'completed', 500, '{}'::jsonb, now(), now() + make_interval(hours => ?))
       ON CONFLICT (actor_scope, operation, key) DO NOTHING RETURNING id`,
      [scope.actorScope, scope.operation, scope.key, scope.fingerprint, ttl]
    )
  } catch (error) {
    if ((error as { code?: string }).code === '55P03') {
      throw new DomainError('IDEMPOTENCY_IN_PROGRESS', { retryAfterSeconds: 2 })
    }
    throw error
  }
  if (inserted.rows.length === 0) throw new ReplayRequested()
}

async function replay<T>(scope: IdempotencyScope): Promise<IdempotentResponse<T>> {
  const row = await db
    .from('idempotency_keys')
    .where({ actor_scope: scope.actorScope, operation: scope.operation, key: scope.key })
    .select('fingerprint', 'response_status', 'response_body')
    .first()
  // Deleted between the conflict and this read (expired and purged): ask for a retry.
  if (!row) throw new DomainError('IDEMPOTENCY_IN_PROGRESS', { retryAfterSeconds: 2 })
  if (!Buffer.from(row.fingerprint).equals(scope.fingerprint)) {
    throw new DomainError('IDEMPOTENCY_KEY_REUSED')
  }
  return { status: Number(row.response_status), body: row.response_body as T, replayed: true }
}
