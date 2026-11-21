import { DomainError } from '#exceptions/domain_error'
import { recordAudit } from '#modules/audit/actions/record_audit'
import type { Actor } from '#modules/platform/actor'
import { sendJob } from '#modules/platform/jobs'
import { withTx } from '#modules/platform/tx'
import { courierProvider } from '#modules/logistics/providers/registry'
import type { BranchView } from '#modules/logistics/queries'
import { branch as readBranch } from '#modules/logistics/queries'

/*
 * Staff operations on courier branches (docs/04a §9.12, docs/06 §13.8):
 * ask for a sync now (`adminSyncLogisticsBranches`), and map a branch to a
 * district (`adminUpdateLogisticsBranch`; last write wins, the audit row
 * keeps both values). Both under `platform.logistics.manage`, no step-up.
 */

export async function requestBranchSync(providerCode: string, actor: Actor) {
  if (!courierProvider(providerCode)?.capabilities.branches) {
    throw new DomainError('VALIDATION_FAILED', {
      errors: [
        {
          field: 'provider_code',
          code: 'no_branches',
          message: 'This courier does not book by branch.',
        },
      ],
    })
  }
  await withTx((trx) =>
    sendJob(trx, 'logistics.sync_branches', {
      provider_code: providerCode,
      request_id: actor.requestId,
      causation_id: null,
    })
  )
}

export async function updateBranchDistrict<T>(
  command: { branchId: string; districtCode: string | null },
  context: { actor: Actor; present: (branch: BranchView) => T }
) {
  await withTx(async (trx) => {
    const row = await trx
      .from('logistics_branches')
      .where('id', command.branchId)
      .forUpdate()
      .first()
    if (!row) throw new DomainError('NOT_FOUND')
    if (command.districtCode) {
      const district = await trx.from('districts').where('code', command.districtCode).first()
      if (!district) {
        throw new DomainError('VALIDATION_FAILED', {
          errors: [
            { field: 'district_code', code: 'unknown_district', message: 'Unknown district.' },
          ],
        })
      }
    }
    await trx
      .from('logistics_branches')
      .where('id', row.id)
      .update({ district_code: command.districtCode })
    await recordAudit(trx, {
      actorType: context.actor.type,
      actorUserId: context.actor.userId,
      actorRole: context.actor.role,
      requestId: context.actor.requestId,
      ipHash: context.actor.ipHash ?? null,
      action: 'logistics_branch.update',
      subjectType: 'logistics_branch',
      subjectId: row.id,
      changes: { district_code: { from: row.district_code, to: command.districtCode } },
    })
  })
  return context.present((await readBranch(command.branchId))!)
}
