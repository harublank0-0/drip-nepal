import logger from '@adonisjs/core/services/logger'
import { jobTx } from '#modules/platform/tx'
import { courierAccountFrom } from '#modules/logistics/providers/courier_accounts'
import { courierProvider } from '#modules/logistics/providers/registry'
import type { JobPayloads } from '#modules/platform/jobs'

/*
 * `logistics.verify_account` (docs/04a §9.9): the test call that moves a
 * `pending` account to `active` or `invalid`, so only the worker decrypts
 * `credentials_enc`. The call is the account's assigned-branches read
 * (decided 2026-11-21, G-14): every NCM account can answer it and booking
 * needs it anyway. The courier's 401 or 403 is `invalid`; any other failure
 * leaves the account `pending` and throws, so the queue retries. The update
 * matches the version the job was sent for, so a job queued before a re-key
 * never activates credentials it did not test.
 */
export async function verifyAccount(payload: JobPayloads['logistics.verify_account']) {
  const row = await jobTx((trx) =>
    trx.from('logistics_accounts').where('id', payload.account_id).first()
  )
  if (!row || row.status !== 'pending' || row.version !== payload.version) return 'stale'
  const provider = courierProvider(row.provider_code)
  if (!provider) return 'no_adapter'
  const result = await provider.listAssignedBranches(
    courierAccountFrom({
      id: row.id,
      environment: row.environment,
      credentialsEnc: row.credentials_enc,
    })
  )
  if (
    !result.ok &&
    result.error.code !== 'auth_failed' &&
    result.error.code !== 'credentials_unavailable'
  ) {
    logger.warn(
      { event: 'logistics.verify_failed', account_id: row.id, code: result.error.code },
      'courier account test call failed'
    )
    throw new Error(`courier test call failed: ${result.error.code}`)
  }
  const to = result.ok ? 'active' : 'invalid'
  return jobTx(async (trx) => {
    const changed = await trx
      .from('logistics_accounts')
      .where({ id: row.id, status: 'pending', version: payload.version })
      .update({
        status: to,
        ...(to === 'active' ? { verified_at: trx.raw('now()') } : {}),
        version: trx.raw('version + 1'),
        updated_at: trx.raw('now()'),
      })
      .returning('id')
    return changed.length > 0 ? to : 'stale'
  })
}
