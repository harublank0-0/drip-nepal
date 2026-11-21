import type { HttpContext } from '@adonisjs/core/http'
import { bookCourierShipment } from '#modules/orders/actions/book_courier_shipment'
import {
  cancelCourierBooking,
  courierBookingOptions,
} from '#modules/orders/actions/courier_bookings'
import { livePickupAddresses } from '#modules/shops/actions/pickup_addresses'
import { assertShopGate, assertShopPermission } from '#modules/shops/permissions'
import {
  accountJson,
  branchJson,
  settingsJson,
  shipmentJson,
} from '#transformers/courier_transformer'
import { pickupAddressJson } from '#transformers/seller/logistics_transformer'
import { idempotencyScope, sellerActor, sendIdempotent } from '#controllers/support/http'
import { assertKnownMembers } from '#validators/support/strict_keys'
import {
  BOOKING_MEMBERS,
  CANCEL_MEMBERS,
  bookCourierShipmentValidator,
  cancelCourierBookingValidator,
} from '#validators/seller/logistics'

/*
 * Courier booking from the seller's order page (docs/06 §13.8; M6), under
 * `shop.orders.process` and the orders-process gate: the form's options, the
 * booking, and its cancellation. The booking and cancellation are ⚷.
 */
export default class CourierBookingsController {
  // getCourierBookingOptions
  async options(ctx: HttpContext) {
    this.#guards(ctx)
    const accountId = ctx.request.input('account_id')
    const options = await courierBookingOptions({
      shopId: ctx.shop.id,
      shopOrderNumber: ctx.params.shopOrderNumber,
      accountId:
        typeof accountId === 'string' && /^[\da-f-]{36}$/i.test(accountId) ? accountId : null,
    })
    const addresses = await livePickupAddresses(ctx.shop.id)
    return {
      data: {
        shipment: options.shipment ? shipmentJson(options.shipment) : null,
        settings: settingsJson(options.settings),
        accounts: options.accounts.map(accountJson),
        account_id: options.accountId,
        pickup_addresses: addresses.map(pickupAddressJson),
        services: options.services,
        assigned_branches_available: options.assignedBranchesAvailable,
        origin_branches: options.originBranches.map(branchJson),
        destination_branches: options.destinationBranches.map(branchJson),
      },
    }
  }

  // bookCourierShipment ⚷
  async book(ctx: HttpContext) {
    this.#guards(ctx)
    assertKnownMembers(ctx.request.body(), BOOKING_MEMBERS)
    const input = await ctx.request.validateUsing(bookCourierShipmentValidator)
    const result = await bookCourierShipment(
      {
        shopId: ctx.shop.id,
        shopOrderNumber: ctx.params.shopOrderNumber,
        accountId: input.account_id,
        pickupAddressId: input.pickup_address_id,
        serviceCode: input.service_code,
        originBranchId: input.origin_branch_id ?? null,
        destinationBranchId: input.destination_branch_id ?? null,
      },
      {
        actor: sellerActor(ctx),
        idempotency: idempotencyScope(ctx, 'bookCourierShipment', input),
        present: (shipment) => ({ data: shipmentJson(shipment) }),
      }
    )
    return sendIdempotent(ctx, result)
  }

  // cancelCourierBooking ⚷
  async cancel(ctx: HttpContext) {
    this.#guards(ctx)
    assertKnownMembers(ctx.request.body(), CANCEL_MEMBERS)
    const input = await ctx.request.validateUsing(cancelCourierBookingValidator)
    const result = await cancelCourierBooking(
      {
        shopId: ctx.shop.id,
        shopOrderNumber: ctx.params.shopOrderNumber,
        reason: input.reason ?? null,
      },
      {
        actor: sellerActor(ctx),
        idempotency: idempotencyScope(ctx, 'cancelCourierBooking', input),
        present: (shipment) => ({ data: shipmentJson(shipment) }),
      }
    )
    return sendIdempotent(ctx, result)
  }

  #guards(ctx: HttpContext) {
    assertShopPermission(ctx.shop, 'shop.orders.process')
    assertShopGate(ctx.shop, 'orders_process')
  }
}
