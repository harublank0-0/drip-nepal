import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const AdminLogisticsController = () => import('#controllers/admin/logistics_controller')
const AdminCourierBookingsController = () =>
  import('#controllers/admin/courier_bookings_controller')

/*
 * Admin JSON operations (docs/06 §13.8; M6 courier work). Every route runs
 * `auth`, then `platformStaff` with its permission (docs/07 §4.2): an active
 * staff row, MFA within 12 hours. Route names are the operationIds.
 */
const logistics = middleware.platformStaff({ permission: 'platform.logistics.manage' })
const intervene = middleware.platformStaff({ permission: 'platform.orders.intervene' })

router
  .group(() => {
    router
      .get('/logistics/accounts', [AdminLogisticsController, 'accounts'])
      .as('adminListLogisticsAccounts')
      .use(logistics)
    router
      .post('/logistics/accounts', [AdminLogisticsController, 'createAccount'])
      .as('adminCreateLogisticsAccount')
      .use(logistics)
    router
      .post('/logistics/accounts/:accountId/credentials', [
        AdminLogisticsController,
        'rekeyAccount',
      ])
      .as('adminRekeyLogisticsAccount')
      .where('accountId', router.matchers.uuid())
      .use(logistics)
    router
      .put('/logistics/accounts/:accountId/shops/:shopId', [AdminLogisticsController, 'allowShop'])
      .as('adminAllowShopOnLogisticsAccount')
      .where('accountId', router.matchers.uuid())
      .where('shopId', router.matchers.uuid())
      .use(logistics)
    router
      .delete('/logistics/accounts/:accountId/shops/:shopId', [
        AdminLogisticsController,
        'removeShop',
      ])
      .as('adminRemoveShopFromLogisticsAccount')
      .where('accountId', router.matchers.uuid())
      .where('shopId', router.matchers.uuid())
      .use(logistics)
    router
      .post('/logistics/accounts/:accountId/status', [AdminLogisticsController, 'setAccountStatus'])
      .as('adminSetLogisticsAccountStatus')
      .where('accountId', router.matchers.uuid())
      .use(logistics)
    router
      .put('/shops/:shopId/logistics-enabled', [AdminLogisticsController, 'setShopEnabled'])
      .as('adminSetShopLogisticsEnabled')
      .where('shopId', router.matchers.uuid())
      .use(logistics)
    router
      .get('/logistics/branches', [AdminLogisticsController, 'branches'])
      .as('adminListLogisticsBranches')
      .use(logistics)
    router
      .post('/logistics/branches/sync', [AdminLogisticsController, 'syncBranches'])
      .as('adminSyncLogisticsBranches')
      .use(logistics)
    router
      .patch('/logistics/branches/:branchId', [AdminLogisticsController, 'updateBranch'])
      .as('adminUpdateLogisticsBranch')
      .where('branchId', router.matchers.uuid())
      .use(logistics)

    router
      .get('/courier-bookings', [AdminCourierBookingsController, 'queue'])
      .as('adminListCourierBookings')
      .use(intervene)
    router
      .post('/shop-orders/:shopOrderNumber/courier-booking/resolution', [
        AdminCourierBookingsController,
        'resolve',
      ])
      .as('adminResolveCourierBooking')
      .use(intervene)
    router
      .post('/shop-orders/:shopOrderNumber/courier-refresh', [
        AdminCourierBookingsController,
        'refresh',
      ])
      .as('adminRefreshCourierStatus')
      .use(intervene)
    router
      .get('/courier-events', [AdminCourierBookingsController, 'events'])
      .as('adminListCourierEvents')
      .use(intervene)
    router
      .post('/courier-events/:courierEventId/resolution', [
        AdminCourierBookingsController,
        'resolveEvent',
      ])
      .as('adminResolveCourierEvent')
      .where('courierEventId', router.matchers.uuid())
      .use(intervene)
    router
      .post('/orders/:orderNumber/verification', [AdminCourierBookingsController, 'verify'])
      .as('adminRecordOrderVerification')
      .use(intervene)
  })
  .prefix('/api/v1/admin')
  .use(middleware.auth())
