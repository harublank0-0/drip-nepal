import type { HttpContext } from '@adonisjs/core/http'
import { requestBranchSync, updateBranchDistrict } from '#modules/logistics/actions/branches'
import {
  allowShopOnLogisticsAccount,
  createPlatformLogisticsAccount,
  rekeyPlatformLogisticsAccount,
  removeShopFromLogisticsAccount,
  setLogisticsAccountStatus,
} from '#modules/logistics/actions/courier_accounts'
import { setShopLogisticsEnabled } from '#modules/logistics/actions/logistics_settings'
import {
  courierProviderCodes,
  LIST_FILTER_VALUES,
  listAccounts,
  listBranches,
} from '#modules/logistics/queries'
import { accountHasUnfinishedShipments } from '#modules/orders/queries'
import {
  accountJson,
  accountShopJson,
  branchJson,
  settingsJson,
} from '#transformers/courier_transformer'
import {
  assertStepUp,
  expectedVersion,
  idempotencyScope,
  sendIdempotent,
  setEtag,
  staffActor,
} from '#controllers/support/http'
import { listRequest, oneOf } from '#controllers/support/cursor'
import { assertKnownMembers } from '#validators/support/strict_keys'
import {
  ACCOUNT_STATUS_MEMBERS,
  BRANCH_MEMBERS,
  CREATE_ACCOUNT_MEMBERS,
  REKEY_ACCOUNT_MEMBERS,
  SHOP_ENABLED_MEMBERS,
  SYNC_MEMBERS,
  createLogisticsAccountValidator,
  rekeyLogisticsAccountValidator,
  setLogisticsAccountStatusValidator,
  setShopLogisticsEnabledValidator,
  syncBranchesValidator,
  updateBranchValidator,
} from '#validators/admin/logistics'

/*
 * Platform staff's courier administration (docs/06 §13.8; M6), under
 * `platform.logistics.manage`. Staff list every account; with step-up they
 * create and re-key platform-owned accounts and allow shops on them (OD-58,
 * re-decided 2026-11-22), and suspend, resume and disable any account. They
 * also switch a shop's courier bookings off and keep the branch list. No
 * response carries credentials (T-SEC-040).
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

  // adminCreateLogisticsAccount ⚷ (step-up)
  async createAccount(ctx: HttpContext) {
    assertStepUp(ctx)
    assertKnownMembers(ctx.request.body(), CREATE_ACCOUNT_MEMBERS)
    const input = await ctx.request.validateUsing(createLogisticsAccountValidator)
    // The fingerprint covers the whole body; credentials are hashed into it, never stored.
    const scope = idempotencyScope(ctx, 'adminCreateLogisticsAccount', input)
    const result = await createPlatformLogisticsAccount(
      {
        providerCode: input.provider_code,
        name: input.name,
        environment: input.environment,
        externalAccountRef: input.external_account_ref ?? null,
        credentials: { token: input.credentials.token },
      },
      {
        actor: staffActor(ctx),
        idempotency: scope,
        present: (account) => ({ data: accountJson(account) }),
      }
    )
    return sendIdempotent(ctx, result)
  }

  // adminRekeyLogisticsAccount ⟳ (step-up)
  async rekeyAccount(ctx: HttpContext) {
    assertStepUp(ctx)
    assertKnownMembers(ctx.request.body(), REKEY_ACCOUNT_MEMBERS)
    const input = await ctx.request.validateUsing(rekeyLogisticsAccountValidator)
    const version = expectedVersion(ctx)
    const account = await rekeyPlatformLogisticsAccount(
      {
        accountId: ctx.params.accountId,
        credentials: { token: input.credentials.token },
        expectedVersion: version,
      },
      { actor: staffActor(ctx), present: accountJson }
    )
    setEtag(ctx, account.version)
    return { data: account }
  }

  // adminAllowShopOnLogisticsAccount (step-up)
  async allowShop(ctx: HttpContext) {
    assertStepUp(ctx)
    assertKnownMembers(ctx.request.body(), [])
    const link = await allowShopOnLogisticsAccount(
      { accountId: ctx.params.accountId, shopId: ctx.params.shopId },
      { actor: staffActor(ctx), present: accountShopJson }
    )
    return { data: link }
  }

  // adminRemoveShopFromLogisticsAccount (step-up)
  async removeShop(ctx: HttpContext) {
    assertStepUp(ctx)
    await removeShopFromLogisticsAccount(
      { accountId: ctx.params.accountId, shopId: ctx.params.shopId },
      { actor: staffActor(ctx) }
    )
    return ctx.response.noContent()
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
