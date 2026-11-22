import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const LogisticsAccountsController = () => import('#controllers/admin/logistics/accounts_controller')

/*
 * Admin pages (docs/08 §2.6), GET only (ADR-0004 decision 6). Every route
 * runs `auth`, then `platformStaff` with the page's one access requirement
 * (docs/07 §4.5, §4.8): a caller who is not active staff gets the 404 page,
 * staff without fresh MFA are sent to verify it, and staff without the
 * permission get 403. Page routes keep dotted names (docs/09 §4.3).
 */
router
  .group(() => {
    router
      .get('/logistics', [LogisticsAccountsController, 'index'])
      .as('logistics')
      .use(middleware.platformStaff({ permission: 'platform.logistics.manage' }))
  })
  .prefix('/admin')
  .as('admin')
  .use([middleware.auth()])
