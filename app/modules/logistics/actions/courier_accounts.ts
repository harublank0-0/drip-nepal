import app from '@adonisjs/core/services/app'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError, InvalidStateTransition, VersionConflict } from '#exceptions/domain_error'
import { recordAudit } from '#modules/audit/actions/record_audit'
import type { Actor } from '#modules/platform/actor'
import { encryptField } from '#modules/platform/crypto/field_crypto'
import { idempotentTx, type IdempotencyScope } from '#modules/platform/idempotency'
import { sendJob } from '#modules/platform/jobs'
import { withTx } from '#modules/platform/tx'
import { CREDENTIALS_AAD } from '#modules/logistics/providers/courier_accounts'
import { courierProvider } from '#modules/logistics/providers/registry'
import { account as readAccount, type AccountView } from '#modules/logistics/queries'

/*
 * Courier accounts (docs/04a §9.9, docs/06 §13.8; M6, OD-56). R1 offers
 * shop-owned accounts only (decided 2026-11-21): the owner creates, re-keys
 * and disables them under `shop.courier_accounts.manage`, after password
 * re-entry, which the HTTP layer checks before calling here; platform staff
 * suspend, resume and disable any account under `platform.logistics.manage`
 * with step-up. Every change writes one `audit_logs` row that names the
 * account and never the credentials (TM-32). The credentials exist in
 * plaintext only in the caller's memory: they are encrypted before any
 * write and never returned, logged, queued or audited (T-SEC-040).
 *
 * An account a shipment still needs (booking unresolved, or the parcel
 * moving) cannot be disabled (409): its credentials still read and cancel
 * those parcels. The shipments belong to `orders`, above this module, so the
 * caller passes that check in (`unfinishedShipments`).
 */

export type Credentials = { token: string }

export type UnfinishedShipmentsCheck = (
  trx: TransactionClientContract,
  accountId: string
) => Promise<boolean>

const auditRow = (actor: Actor) => ({
  actorType: actor.type,
  actorUserId: actor.userId,
  actorRole: actor.role,
  requestId: actor.requestId,
  ipHash: actor.ipHash ?? null,
})

async function lockedAccount(trx: TransactionClientContract, accountId: string, shopId?: string) {
  const query = trx.from('logistics_accounts').where('id', accountId).forUpdate()
  if (shopId) query.where('shop_id', shopId)
  return query.first()
}

async function sendVerify(
  trx: TransactionClientContract,
  accountId: string,
  version: number,
  actor: Actor
) {
  await sendJob(trx, 'logistics.verify_account', {
    account_id: accountId,
    version,
    request_id: actor.requestId,
    causation_id: null,
  })
}

// Disabling erases the credentials and, in the same transaction, stops every shop using the account.
async function disableLocked(trx: TransactionClientContract, accountId: string) {
  await trx
    .from('logistics_accounts')
    .where('id', accountId)
    .update({
      status: 'disabled',
      credentials_enc: null,
      disabled_at: trx.raw('now()'),
      version: trx.raw('version + 1'),
      updated_at: trx.raw('now()'),
    })
  await trx
    .from('logistics_account_shops')
    .where({ account_id: accountId, is_active: true })
    .update({ is_active: false, disabled_at: trx.raw('now()'), updated_at: trx.raw('now()') })
  await returnShopsToManual(trx, accountId)
}

// A shop whose default this account was goes back to `manual` (docs/04a §9.11).
export async function returnShopsToManual(
  trx: TransactionClientContract,
  accountId: string,
  shopId?: string
) {
  const query = trx.from('shop_logistics_settings').where('default_account_id', accountId)
  if (shopId) query.where('shop_id', shopId)
  await query.update({
    fulfillment_mode: 'manual',
    default_account_id: null,
    default_account_owner_type: null,
    version: trx.raw('version + 1'),
    updated_at: trx.raw('now()'),
  })
}

export async function createShopCourierAccount<T>(
  command: {
    shopId: string
    providerCode: string
    name: string
    environment: 'sandbox' | 'production'
    externalAccountRef: string | null
    credentials: Credentials
  },
  context: {
    actor: Actor
    idempotency: IdempotencyScope | null
    present: (account: AccountView) => T
  }
) {
  const provider = await withTx((trx) =>
    trx.from('logistics_providers').where('code', command.providerCode).first()
  )
  if (!provider?.is_active || !courierProvider(command.providerCode)) {
    throw validation('provider_code', 'provider_inactive', 'This courier is not available.')
  }
  if (app.inProduction && command.environment === 'sandbox') {
    throw validation(
      'environment',
      'sandbox_in_production',
      'A sandbox account cannot be used here.'
    )
  }
  return idempotentTx(context.idempotency, async (trx) => {
    if (command.externalAccountRef) {
      const taken = await trx
        .from('logistics_accounts')
        .where({
          provider_code: command.providerCode,
          environment: command.environment,
          external_account_ref: command.externalAccountRef,
        })
        .first()
      if (taken) {
        throw validation(
          'external_account_ref',
          'already_registered',
          'This courier account is already registered.'
        )
      }
    }
    const [row] = await trx
      .table('logistics_accounts')
      .insert({
        provider_code: command.providerCode,
        owner_type: 'shop',
        shop_id: command.shopId,
        name: command.name,
        environment: command.environment,
        external_account_ref: command.externalAccountRef,
        credentials_enc: encryptField(JSON.stringify(command.credentials), CREDENTIALS_AAD),
        status: 'pending',
      })
      .returning(['id', 'version'])
    await trx.table('logistics_account_shops').insert({
      account_id: row.id,
      shop_id: command.shopId,
      account_owner_type: 'shop',
      owner_shop_id: command.shopId,
    })
    await recordAudit(trx, {
      ...auditRow(context.actor),
      action: 'logistics_account.create',
      subjectType: 'logistics_account',
      subjectId: row.id,
      shopId: command.shopId,
      changes: {
        provider_code: command.providerCode,
        environment: command.environment,
        status: 'pending',
      },
    })
    await sendVerify(trx, row.id, row.version, context.actor)
    const created = await viewIn(trx, row.id)
    return { status: 201, body: context.present(created) }
  })
}

export async function rekeyShopCourierAccount<T>(
  command: { shopId: string; accountId: string; credentials: Credentials; expectedVersion: number },
  context: { actor: Actor; present: (account: AccountView) => T }
) {
  return withTx(async (trx) => {
    const row = await lockedAccount(trx, command.accountId, command.shopId)
    if (!row) throw new DomainError('NOT_FOUND')
    if (row.status === 'disabled') throw new InvalidStateTransition('disabled', [])
    if (row.version !== command.expectedVersion) {
      throw new VersionConflict(
        context.present(await viewIn(trx, row.id)) as Record<string, unknown>
      )
    }
    // A suspended account stays suspended: only staff resume it (decided 2026-11-21, G-19).
    const suspended = row.status === 'suspended'
    const [updated] = await trx
      .from('logistics_accounts')
      .where('id', row.id)
      .update({
        credentials_enc: encryptField(JSON.stringify(command.credentials), CREDENTIALS_AAD),
        status: suspended ? 'suspended' : 'pending',
        version: trx.raw('version + 1'),
        updated_at: trx.raw('now()'),
      })
      .returning(['version'])
    await recordAudit(trx, {
      ...auditRow(context.actor),
      action: 'logistics_account.rekey',
      subjectType: 'logistics_account',
      subjectId: row.id,
      shopId: command.shopId,
      changes: { status: { from: row.status, to: suspended ? 'suspended' : 'pending' } },
    })
    if (!suspended) await sendVerify(trx, row.id, updated.version, context.actor)
    return context.present(await viewIn(trx, row.id))
  })
}

export async function disableShopCourierAccount<T>(
  command: { shopId: string; accountId: string },
  context: {
    actor: Actor
    unfinishedShipments: UnfinishedShipmentsCheck
    present: (account: AccountView) => T
  }
) {
  return withTx(async (trx) => {
    const row = await lockedAccount(trx, command.accountId, command.shopId)
    if (!row) throw new DomainError('NOT_FOUND')
    await assertDisableable(trx, row, context.unfinishedShipments)
    await disableLocked(trx, row.id)
    await recordAudit(trx, {
      ...auditRow(context.actor),
      action: 'logistics_account.disable',
      subjectType: 'logistics_account',
      subjectId: row.id,
      shopId: command.shopId,
      changes: { status: { from: row.status, to: 'disabled' } },
    })
    return context.present(await viewIn(trx, row.id))
  })
}

async function assertDisableable(
  trx: TransactionClientContract,
  row: { id: string; status: string },
  unfinishedShipments: UnfinishedShipmentsCheck
) {
  if (row.status === 'disabled') throw new InvalidStateTransition('disabled', [])
  if (await unfinishedShipments(trx, row.id)) {
    throw new DomainError('INVALID_STATE_TRANSITION', {
      detail:
        'A parcel booked on this account is not finished yet. Suspend the account until it is.',
      extensions: { current_status: row.status, allowed_events: ['suspended'] },
    })
  }
}

// Staff: suspend, resume (back to `pending`, re-verified) or disable any account.
export async function setLogisticsAccountStatus<T>(
  command: { accountId: string; status: 'suspended' | 'pending' | 'disabled'; reason: string },
  context: {
    actor: Actor
    unfinishedShipments: UnfinishedShipmentsCheck
    present: (account: AccountView) => T
  }
) {
  return withTx(async (trx) => {
    const row = await lockedAccount(trx, command.accountId)
    if (!row) throw new DomainError('NOT_FOUND')
    const from = row.status as string
    if (command.status === 'disabled') {
      await assertDisableable(trx, row, context.unfinishedShipments)
      await disableLocked(trx, row.id)
    } else {
      const allowed =
        command.status === 'suspended'
          ? from !== 'disabled' && from !== 'suspended'
          : from === 'suspended'
      if (!allowed) {
        throw new InvalidStateTransition(
          from,
          from === 'disabled'
            ? []
            : from === 'suspended'
              ? ['pending', 'disabled']
              : ['suspended', 'disabled']
        )
      }
      const [updated] = await trx
        .from('logistics_accounts')
        .where({ id: row.id, status: from })
        .update({
          status: command.status,
          version: trx.raw('version + 1'),
          updated_at: trx.raw('now()'),
        })
        .returning(['version'])
      if (command.status === 'pending')
        await sendVerify(trx, row.id, updated.version, context.actor)
    }
    await recordAudit(trx, {
      ...auditRow(context.actor),
      action: 'logistics_account.status_change',
      subjectType: 'logistics_account',
      subjectId: row.id,
      shopId: row.shop_id,
      changes: { status: { from, to: command.status } },
      reason: command.reason,
    })
    return context.present(await viewIn(trx, row.id))
  })
}

// The booking job's `auth_failed` (the courier's 401 or 403 only) moves an active account to `invalid`.
export async function markAccountInvalid(trx: TransactionClientContract, accountId: string) {
  await trx
    .from('logistics_accounts')
    .where({ id: accountId, status: 'active' })
    .update({ status: 'invalid', version: trx.raw('version + 1'), updated_at: trx.raw('now()') })
}

async function viewIn(trx: TransactionClientContract, accountId: string): Promise<AccountView> {
  const row = await trx.from('logistics_accounts').where('id', accountId).first()
  return {
    id: row.id,
    providerCode: row.provider_code,
    ownerType: row.owner_type,
    shopId: row.shop_id,
    name: row.name,
    environment: row.environment,
    externalAccountRef: row.external_account_ref,
    status: row.status,
    verifiedAt: row.verified_at,
    disabledAt: row.disabled_at,
    version: row.version,
    createdAt: row.created_at,
  }
}

function validation(field: string, code: string, message: string) {
  return new DomainError('VALIDATION_FAILED', { errors: [{ field, code, message }] })
}

export { readAccount }
