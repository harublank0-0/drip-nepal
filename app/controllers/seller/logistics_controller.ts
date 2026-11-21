import type { HttpContext } from '@adonisjs/core/http'
import { appUrl } from '#config/app'
import { DomainError } from '#exceptions/domain_error'
import {
  createShopCourierAccount,
  disableShopCourierAccount,
  rekeyShopCourierAccount,
} from '#modules/logistics/actions/courier_accounts'
import { courierCallbackToken } from '#modules/logistics/actions/courier_calls'
import { replaceLogisticsSettings } from '#modules/logistics/actions/logistics_settings'
import { accountsUsableByShop, logisticsSettings, shopAccount } from '#modules/logistics/queries'
import { confirmPassword } from '#modules/identity/actions/confirm_password'
import { accountHasUnfinishedShipments, pickupAddressReferenced } from '#modules/orders/queries'
import {
  archivePickupAddress,
  createPickupAddress,
  livePickupAddresses,
  pickupAddress,
  updatePickupAddress,
  type AddressFields,
} from '#modules/shops/actions/pickup_addresses'
import { assertShopGate, assertShopPermission } from '#modules/shops/permissions'
import { accountJson, settingsJson } from '#transformers/courier_transformer'
import { pickupAddressJson } from '#transformers/seller/logistics_transformer'
import {
  expectedVersion,
  idempotencyScope,
  sellerActor,
  sendIdempotent,
  setEtag,
} from '#controllers/support/http'
import { assertKnownMembers } from '#validators/support/strict_keys'
import {
  COURIER_ACCOUNT_MEMBERS,
  DISABLE_MEMBERS,
  LOGISTICS_SETTINGS_MEMBERS,
  PICKUP_ADDRESS_MEMBERS,
  REKEY_MEMBERS,
  createPickupAddressValidator,
  createShopCourierAccountValidator,
  disableShopCourierAccountValidator,
  rekeyShopCourierAccountValidator,
  replaceLogisticsSettingsValidator,
  updatePickupAddressValidator,
} from '#validators/seller/logistics'

/*
 * The seller's courier settings (docs/06 §13.8; M6): logistics settings,
 * pickup addresses and the shop's own courier accounts. Each operation checks
 * its permission, then the shop status gate (docs/06 §4.4 steps 3–4). The
 * account operations are the owner's, after password re-entry (07 §3.10). No
 * response carries credentials; the account's callback URL, which the owner
 * registers with the courier, is shown only by `getLogisticsSettings` to the
 * owner, and is never stored with an idempotency key.
 */
export default class LogisticsController {
  // getLogisticsSettings
  async show(ctx: HttpContext) {
    assertShopPermission(ctx.shop, 'shop.shipping.manage')
    assertShopGate(ctx.shop, 'shipping')
    const settings = await logisticsSettings(ctx.shop.id)
    const accounts = await accountsUsableByShop(ctx.shop.id)
    const addresses = await livePickupAddresses(ctx.shop.id)
    const owner = ctx.shop.actor === 'owner'
    setEtag(ctx, settings.version)
    return {
      data: {
        settings: settingsJson(settings),
        accounts: accounts.map((account) => ({
          ...accountJson(account),
          callback_url: owner ? callbackUrl(account.providerCode, account.id) : null,
        })),
        pickup_addresses: addresses.map(pickupAddressJson),
      },
    }
  }

  // replaceLogisticsSettings ⟳
  async replace(ctx: HttpContext) {
    assertShopPermission(ctx.shop, 'shop.shipping.manage')
    assertShopGate(ctx.shop, 'shipping')
    assertKnownMembers(ctx.request.body(), LOGISTICS_SETTINGS_MEMBERS)
    const input = await ctx.request.validateUsing(replaceLogisticsSettingsValidator)
    const version = expectedVersion(ctx)
    const settings = await replaceLogisticsSettings(
      {
        shopId: ctx.shop.id,
        fulfillmentMode: input.fulfillment_mode,
        defaultAccountId: input.default_account_id ?? null,
        expectedVersion: version,
      },
      { actor: sellerActor(ctx), present: settingsJson }
    )
    setEtag(ctx, settings.version)
    return { data: settings }
  }

  // createShopCourierAccount ⚷
  async createAccount(ctx: HttpContext) {
    this.#accountGuards(ctx)
    assertKnownMembers(ctx.request.body(), COURIER_ACCOUNT_MEMBERS)
    const input = await ctx.request.validateUsing(createShopCourierAccountValidator)
    // The fingerprint covers the body without the password; credentials are hashed, never stored.
    const { password, ...fingerprinted } = input
    const scope = idempotencyScope(ctx, 'createShopCourierAccount', fingerprinted)
    await confirmPassword(ctx.auth.getUserOrFail().id, password, ctx.request.id() ?? null)
    const result = await createShopCourierAccount(
      {
        shopId: ctx.shop.id,
        providerCode: input.provider_code,
        name: input.name,
        environment: input.environment,
        externalAccountRef: input.external_account_ref ?? null,
        credentials: { token: input.credentials.token },
      },
      {
        actor: sellerActor(ctx),
        idempotency: scope,
        present: (account) => ({ data: accountJson(account) }),
      }
    )
    return sendIdempotent(ctx, result)
  }

  // rekeyShopCourierAccount ⟳
  async rekeyAccount(ctx: HttpContext) {
    this.#accountGuards(ctx)
    assertKnownMembers(ctx.request.body(), REKEY_MEMBERS)
    const input = await ctx.request.validateUsing(rekeyShopCourierAccountValidator)
    const version = expectedVersion(ctx)
    await confirmPassword(ctx.auth.getUserOrFail().id, input.password, ctx.request.id() ?? null)
    const account = await rekeyShopCourierAccount(
      {
        shopId: ctx.shop.id,
        accountId: ctx.params.accountId,
        credentials: { token: input.credentials.token },
        expectedVersion: version,
      },
      { actor: sellerActor(ctx), present: accountJson }
    )
    setEtag(ctx, account.version)
    return { data: account }
  }

  // disableShopCourierAccount
  async disableAccount(ctx: HttpContext) {
    this.#accountGuards(ctx)
    assertKnownMembers(ctx.request.body(), DISABLE_MEMBERS)
    const input = await ctx.request.validateUsing(disableShopCourierAccountValidator)
    if (!(await shopAccount(ctx.shop.id, ctx.params.accountId))) throw new DomainError('NOT_FOUND')
    await confirmPassword(ctx.auth.getUserOrFail().id, input.password, ctx.request.id() ?? null)
    const account = await disableShopCourierAccount(
      { shopId: ctx.shop.id, accountId: ctx.params.accountId },
      {
        actor: sellerActor(ctx),
        unfinishedShipments: accountHasUnfinishedShipments,
        present: accountJson,
      }
    )
    return { data: account }
  }

  // createPickupAddress
  async createPickupAddress(ctx: HttpContext) {
    this.#shippingGuards(ctx)
    assertKnownMembers(ctx.request.body(), PICKUP_ADDRESS_MEMBERS)
    const input = await ctx.request.validateUsing(createPickupAddressValidator)
    const id = await createPickupAddress(
      { shopId: ctx.shop.id, fields: fieldsFrom(input), isDefault: input.is_default ?? false },
      sellerActor(ctx)
    )
    return ctx.response
      .status(201)
      .send({ data: pickupAddressJson((await pickupAddress(ctx.shop.id, id))!) })
  }

  // updatePickupAddress
  async updatePickupAddress(ctx: HttpContext) {
    this.#shippingGuards(ctx)
    assertKnownMembers(ctx.request.body(), PICKUP_ADDRESS_MEMBERS)
    const input = await ctx.request.validateUsing(updatePickupAddressValidator)
    const edits = [
      'contact_name',
      'contact_phone',
      'province_code',
      'district_code',
      'local_level_code',
      'ward_no',
      'area_tole',
    ] as const
    const given = edits.filter((key) => input[key] !== undefined)
    const extras = (['label', 'street_landmark'] as const).filter((key) => input[key] !== undefined)
    if ((given.length > 0 || extras.length > 0) && given.length < edits.length) {
      throw new DomainError('VALIDATION_FAILED', {
        detail: 'Send the whole address when you edit it.',
        errors: edits
          .filter((key) => input[key] === undefined)
          .map((field) => ({ field, code: 'required', message: 'Send the whole address.' })),
      })
    }
    const id = await updatePickupAddress(
      {
        shopId: ctx.shop.id,
        addressId: ctx.params.addressId,
        fields: given.length > 0 ? fieldsFrom(input as Parameters<typeof fieldsFrom>[0]) : null,
        isDefault: input.is_default ?? null,
      },
      { actor: sellerActor(ctx), referencedByShipment: pickupAddressReferenced }
    )
    return { data: pickupAddressJson((await pickupAddress(ctx.shop.id, id))!) }
  }

  // archivePickupAddress
  async archivePickupAddress(ctx: HttpContext) {
    this.#shippingGuards(ctx)
    await archivePickupAddress(
      { shopId: ctx.shop.id, addressId: ctx.params.addressId },
      sellerActor(ctx)
    )
    return ctx.response.noContent()
  }

  #accountGuards(ctx: HttpContext) {
    assertShopPermission(ctx.shop, 'shop.courier_accounts.manage')
    assertShopGate(ctx.shop, 'courier_accounts')
  }

  #shippingGuards(ctx: HttpContext) {
    assertShopPermission(ctx.shop, 'shop.shipping.manage')
    assertShopGate(ctx.shop, 'shipping')
  }
}

function callbackUrl(providerCode: string, accountId: string) {
  const token = courierCallbackToken(accountId)
  if (!token) return null
  return `${appUrl.replace(/\/$/, '')}/api/v1/webhooks/couriers/${providerCode}/${accountId}?token=${token}`
}

function fieldsFrom(input: {
  label?: string | null
  contact_name: string
  contact_phone: string
  province_code: string
  district_code: string
  local_level_code: string
  ward_no: number
  area_tole: string
  street_landmark?: string | null
}): AddressFields {
  return {
    label: input.label ?? null,
    contactName: input.contact_name,
    contactPhone: input.contact_phone,
    provinceCode: input.province_code,
    districtCode: input.district_code,
    localLevelCode: input.local_level_code,
    wardNo: input.ward_no,
    areaTole: input.area_tole,
    streetLandmark: input.street_landmark ?? null,
  }
}
