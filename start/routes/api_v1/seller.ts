import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const ShopsController = () => import('#controllers/api/v1/seller/shops/shops_controller')
const LogisticsController = () => import('#controllers/seller/logistics_controller')
const CourierBookingsController = () => import('#controllers/seller/courier_bookings_controller')

/*
 * Seller JSON operations (docs/06 §13.5, §13.8): the shop reads of R1-S part
 * 1a and the M6 courier work. `listMyShops` is the one seller route outside
 * `{shopSlug}`: `auth` only, the `session` requirement of docs/07 §4.5.
 * Every other route runs `auth`, then `sellerContext` on the exact
 * `:shopSlug` segment (T-SEC-005, T-SEC-037); the controllers check the
 * permission and the status gate. Route names are the operationIds
 * (docs/09 §3.3).
 */
router
  .get('/api/v1/seller/shops', [ShopsController, 'listMyShops'])
  .as('listMyShops')
  .use(middleware.auth())

router
  .group(() => {
    router.get('/', [ShopsController, 'getSellerShop']).as('getSellerShop')
    router.get('/logistics', [LogisticsController, 'show']).as('getLogisticsSettings')
    router.put('/logistics', [LogisticsController, 'replace']).as('replaceLogisticsSettings')
    router
      .post('/courier-accounts', [LogisticsController, 'createAccount'])
      .as('createShopCourierAccount')
    router
      .post('/courier-accounts/:accountId/credentials', [LogisticsController, 'rekeyAccount'])
      .as('rekeyShopCourierAccount')
      .where('accountId', router.matchers.uuid())
    router
      .post('/courier-accounts/:accountId/disable', [LogisticsController, 'disableAccount'])
      .as('disableShopCourierAccount')
      .where('accountId', router.matchers.uuid())
    router
      .post('/pickup-addresses', [LogisticsController, 'createPickupAddress'])
      .as('createPickupAddress')
    router
      .patch('/pickup-addresses/:addressId', [LogisticsController, 'updatePickupAddress'])
      .as('updatePickupAddress')
      .where('addressId', router.matchers.uuid())
    router
      .delete('/pickup-addresses/:addressId', [LogisticsController, 'archivePickupAddress'])
      .as('archivePickupAddress')
      .where('addressId', router.matchers.uuid())
    router
      .get('/orders/:shopOrderNumber/courier-booking-options', [
        CourierBookingsController,
        'options',
      ])
      .as('getCourierBookingOptions')
    router
      .post('/orders/:shopOrderNumber/courier-booking', [CourierBookingsController, 'book'])
      .as('bookCourierShipment')
    router
      .post('/orders/:shopOrderNumber/courier-booking/cancel', [
        CourierBookingsController,
        'cancel',
      ])
      .as('cancelCourierBooking')
  })
  .prefix('/api/v1/seller/shops/:shopSlug')
  .use([middleware.auth(), middleware.sellerContext({ requirement: 'shop.member' })])
