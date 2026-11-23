import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const AccountController = () => import('#controllers/account/identity/account_controller')

/*
 * Account pages (docs/08 §2.4), GET only (ADR-0004 decision 6), rendered in
 * the browser (config/inertia.ts), behind `auth`: a guest is sent to
 * `/login` with the page as `return_to` (docs/09 §5.4). M1 part 6a adds the
 * profile and the security page, part 6b the address book; orders, shops
 * and support cases come with their milestones. Page routes keep dotted
 * names (docs/09 §4.3).
 */
router
  .group(() => {
    router.get('/', [AccountController, 'overview']).as('overview')
    router.get('/addresses', [AccountController, 'addresses']).as('addresses')
    router.get('/security', [AccountController, 'security']).as('security')
  })
  .prefix('/account')
  .as('account')
  .use(middleware.auth())
