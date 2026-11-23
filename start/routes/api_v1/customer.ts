import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const AddressesController = () =>
  import('#controllers/api/v1/customer/identity/addresses_controller')

/*
 * Customer JSON operations (docs/06 §13.4), behind `auth`. M1 part 6b adds
 * the address book (`listAddresses`, `createAddress`, `updateAddress`,
 * `deleteAddress`); the cart, orders, shop applications and support cases
 * come with their milestones. `:addressId` must look like a UUID (the
 * matcher of start/routes.ts), so anything else answers 404 like a missing
 * address. Route names are the operationIds (docs/09 §3.3). CSRF applies to
 * every unsafe route here.
 */
router
  .group(() => {
    router.get('/me/addresses', [AddressesController, 'listAddresses']).as('listAddresses')
    router.post('/me/addresses', [AddressesController, 'createAddress']).as('createAddress')
    router
      .patch('/me/addresses/:addressId', [AddressesController, 'updateAddress'])
      .as('updateAddress')
    router
      .delete('/me/addresses/:addressId', [AddressesController, 'deleteAddress'])
      .as('deleteAddress')
  })
  .prefix('/api/v1')
  .use(middleware.auth())
