import type { HttpContext } from '@adonisjs/core/http'
import { requestBranchSync, updateBranchDistrict } from '#modules/logistics/actions/branches'
import { setLogisticsAccountStatus } from '#modules/logistics/actions/courier_accounts'
import { setShopLogisticsEnabled } from '#modules/logistics/actions/logistics_settings'
import {
  courierProviderCodes,
  LIST_FILTER_VALUES,
  listAccounts,
  listBranches,
} from '#modules/logistics/queries'
import { accountHasUnfinishedShipments } from '#modules/orders/queries'
import { accountJson, branchJson, settingsJson } from '#transformers/courier_transformer'
import { assertStepUp, staffActor } from '#controllers/support/http'
import { listRequest, oneOf } from '#controllers/support/cursor'
import { assertKnownMembers } from '#validators/support/strict_keys'
import {
  ACCOUNT_STATUS_MEMBERS,
  BRANCH_MEMBERS,
  SHOP_ENABLED_MEMBERS,
  SYNC_MEMBERS,
  setLogisticsAccountStatusValidator,
  setShopLogisticsEnabledValidator,
  syncBranchesValidator,
  updateBranchValidator,
} from '#validators/admin/logistics'

/*
 * Platform staff's courier administration (docs/06 §13.8; M6), under
 * `platform.logistics.manage`. R1 has shop-owned accounts only (decided
 * 2026-11-21), so staff list, suspend, resume and disable them (with
 * step-up), switch a shop's courier bookings off, and keep the branch list.
 * The platform-owned account operations wait for the release that adds them.
 */
export default class AdminLogisticsController {
  // adminListLogisticsAccounts
  async accounts(ctx: HttpContext) {
    const ownerType = oneOf(ctx, 'owner_type', LIST_FILTER_VALUES.ownerTypes)
    const status = oneOf(ctx, 'status', LIST_FILTER_VALUES.accountStatuses)
    const list = listRequest(ctx, {
      sort: 'created_at',
      keyKind: 'timestamp',
      parameters: ['owner_type', 'status'],
      filters: { owner_type: ownerType, status },
    })
    const result = await listAccounts({ ownerType, status, limit: list.limit, seek: list.seek })
    return {
      data: result.accounts.map((account) => ({
        ...accountJson(account),
        shop_id: account.shopId,
        shops: account.shops.map((link) => ({ shop_id: link.shopId, is_active: link.isActive })),
      })),
      meta: list.meta(result.last),
    }
  }

  // adminSetLogisticsAccountStatus (step-up)
  async setAccountStatus(ctx: HttpContext) {
    assertStepUp(ctx)
    assertKnownMembers(ctx.request.body(), ACCOUNT_STATUS_MEMBERS)
    const input = await ctx.request.validateUsing(setLogisticsAccountStatusValidator)
    const account = await setLogisticsAccountStatus(
      { accountId: ctx.params.accountId, status: input.status, reason: input.reason },
      {
        actor: staffActor(ctx),
        unfinishedShipments: accountHasUnfinishedShipments,
        present: accountJson,
      }
    )
    return { data: account }
  }

  // adminSetShopLogisticsEnabled
  async setShopEnabled(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), SHOP_ENABLED_MEMBERS)
    const input = await ctx.request.validateUsing(setShopLogisticsEnabledValidator)
    const settings = await setShopLogisticsEnabled(
      { shopId: ctx.params.shopId, isEnabled: input.is_enabled, reason: input.reason },
      { actor: staffActor(ctx), present: settingsJson }
    )
    return { data: settings }
  }

  // adminListLogisticsBranches
  async branches(ctx: HttpContext) {
    const providerCode = oneOf(ctx, 'provider_code', courierProviderCodes(), 'ncm')!
    const isActive = oneOf(ctx, 'is_active', ['true', 'false'] as const)
    const unmapped = oneOf(ctx, 'unmapped', ['true', 'false'] as const)
    const list = listRequest(ctx, {
      sort: 'name',
      keyKind: 'text',
      parameters: ['provider_code', 'is_active', 'unmapped'],
      filters: { provider_code: providerCode, is_active: isActive, unmapped },
    })
    const result = await listBranches({
      providerCode,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      unmapped: unmapped === 'true',
      limit: list.limit,
      seek: list.seek,
    })
    return { data: result.branches.map(branchJson), meta: list.meta(result.last) }
  }

  // adminSyncLogisticsBranches
  async syncBranches(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), SYNC_MEMBERS)
    const input = await ctx.request.validateUsing(syncBranchesValidator)
    await requestBranchSync(input.provider_code, staffActor(ctx))
    return ctx.response.accepted({ data: { queued: true } })
  }

  // adminUpdateLogisticsBranch
  async updateBranch(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), BRANCH_MEMBERS)
    const input = await ctx.request.validateUsing(updateBranchValidator)
    const branch = await updateBranchDistrict(
      { branchId: ctx.params.branchId, districtCode: input.district_code },
      { actor: staffActor(ctx), present: branchJson }
    )
    return { data: branch }
  }
}
