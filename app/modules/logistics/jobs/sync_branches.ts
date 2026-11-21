import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { raiseAlert } from '#modules/platform/alerts'
import { jobTx } from '#modules/platform/tx'
import { courierAccountFrom } from '#modules/logistics/providers/courier_accounts'
import { courierProvider } from '#modules/logistics/providers/registry'
import type { CourierBranch } from '#modules/logistics/providers/courier_provider'
import type { JobPayloads } from '#modules/platform/jobs'

/*
 * `logistics.sync_branches` (docs/04a §9.12): reads a courier's branch list
 * through the adapter and upserts it, by the courier's branch ID when it gives
 * one, else by name. A branch missing from the list becomes inactive; one that
 * comes back is reactivated. A failed call, an empty list, a list that would
 * deactivate more than half the active branches, or a name the courier now
 * gives to another branch ID changes nothing and raises an admin alert.
 * `district_code` is filled only while null, from an exact district-name match.
 *
 * The list needs an account's token. R1 has no platform-owned account, so the
 * sync uses the most recently verified active account of the courier, a
 * production one in production (decided 2026-11-21, G-15). With none, it
 * stops quietly: there is nobody to book for yet.
 */

export type SyncOutcome =
  | { kind: 'synced'; inserted: number; updated: number; deactivated: number; reactivated: number }
  | { kind: 'refused'; reason: string }

export async function syncBranches(
  payload: JobPayloads['logistics.sync_branches']
): Promise<SyncOutcome> {
  const provider = courierProvider(payload.provider_code)
  if (!provider?.capabilities.branches) return { kind: 'refused', reason: 'no_branches_capability' }
  const account = await jobTx((trx) => {
    const query = trx
      .from('logistics_accounts')
      .where({ provider_code: payload.provider_code, status: 'active' })
      .orderBy('verified_at', 'desc')
      .orderBy('id', 'asc')
    if (app.inProduction) query.where('environment', 'production')
    return query.first()
  })
  if (!account) return { kind: 'refused', reason: 'no_active_account' }

  const result = await provider.listBranches(
    courierAccountFrom({
      id: account.id,
      environment: account.environment,
      credentialsEnc: account.credentials_enc,
    })
  )
  if (!result.ok) return stop(payload.provider_code, 'call_failed', { code: result.error.code })
  const branches = dedupeByName(result.value)
  if (branches.length === 0) return stop(payload.provider_code, 'empty_list')

  return jobTx(async (trx) => {
    const existing = await trx
      .from('logistics_branches')
      .where('provider_code', payload.provider_code)
      .forUpdate()
    const byExternal = new Map(
      existing.filter((row) => row.external_branch_id).map((row) => [row.external_branch_id, row])
    )
    const byName = new Map(existing.map((row) => [row.name, row]))
    const districts = await trx.from('districts').select('code', 'name_en')
    const districtCode = (name: string | null) => {
      if (!name) return null
      const wanted = name.trim().toLowerCase()
      return districts.find((row) => String(row.name_en).toLowerCase() === wanted)?.code ?? null
    }

    // Match every listed branch first; a clash stops the whole sync.
    const matches = new Map<CourierBranch, (typeof existing)[number] | null>()
    for (const listed of branches) {
      const match =
        (listed.externalBranchId ? byExternal.get(listed.externalBranchId) : undefined) ??
        byName.get(listed.name) ??
        null
      const owner = byName.get(listed.name)
      if (owner && match && owner.id !== match.id) {
        return stop(payload.provider_code, 'name_clash', { name: listed.name })
      }
      if (
        match &&
        listed.externalBranchId &&
        match.external_branch_id &&
        match.external_branch_id !== listed.externalBranchId
      ) {
        return stop(payload.provider_code, 'name_clash', { name: listed.name })
      }
      matches.set(listed, match)
    }
    const listedIds = new Set([...matches.values()].filter(Boolean).map((row) => row!.id))
    const activeBefore = existing.filter((row) => row.is_active)
    const toDeactivate = activeBefore.filter((row) => !listedIds.has(row.id))
    if (activeBefore.length > 0 && toDeactivate.length * 2 > activeBefore.length) {
      return stop(payload.provider_code, 'mass_deactivation', {
        active: activeBefore.length,
        missing: toDeactivate.length,
      })
    }

    let inserted = 0
    let updated = 0
    let reactivated = 0
    for (const [listed, match] of matches) {
      const values = {
        name: listed.name,
        external_branch_id: listed.externalBranchId,
        code: listed.code,
        courier_district: listed.courierDistrict,
        covered_areas: listed.coveredAreas,
        phone: listed.phone,
        is_active: true,
        synced_at: trx.raw('now()'),
      }
      if (!match) {
        await trx.table('logistics_branches').insert({
          provider_code: payload.provider_code,
          ...values,
          district_code: districtCode(listed.courierDistrict),
        })
        inserted++
        continue
      }
      const changed =
        match.name !== listed.name ||
        (match.external_branch_id ?? null) !== listed.externalBranchId ||
        (match.code ?? null) !== listed.code ||
        (match.courier_district ?? null) !== listed.courierDistrict ||
        (match.covered_areas ?? null) !== listed.coveredAreas ||
        (match.phone ?? null) !== listed.phone ||
        !match.is_active
      if (!match.is_active) reactivated++
      await trx
        .from('logistics_branches')
        .where('id', match.id)
        .update({
          ...values,
          ...(match.district_code === null
            ? { district_code: districtCode(listed.courierDistrict) }
            : {}),
        })
      if (changed) updated++
    }
    if (toDeactivate.length > 0) {
      await trx
        .from('logistics_branches')
        .whereIn(
          'id',
          toDeactivate.map((row) => row.id)
        )
        .update({ is_active: false })
    }
    const outcome = { inserted, updated, deactivated: toDeactivate.length, reactivated }
    logger.info(
      { event: 'logistics.branches_synced', provider_code: payload.provider_code, ...outcome },
      'branches synced'
    )
    return { kind: 'synced', ...outcome } as const
  })
}

// The courier lists each branch once; a repeated name keeps its first row.
function dedupeByName(branches: CourierBranch[]) {
  const seen = new Set<string>()
  return branches.filter((branch) =>
    seen.has(branch.name) ? false : (seen.add(branch.name), true)
  )
}

function stop(
  providerCode: string,
  reason: string,
  fields: Record<string, string | number> = {}
): SyncOutcome {
  raiseAlert('logistics.branch_sync_stopped', { provider_code: providerCode, reason, ...fields })
  return { kind: 'refused', reason }
}
