import router from '@adonisjs/core/services/router'

const LocationsController = () =>
  import('#controllers/api/v1/public/logistics/locations_controller')

/*
 * Public JSON operations (docs/06 §13.2), open to anyone, signed in or not:
 * no `auth` and no `guest`. M1 part 6b adds the address cascades
 * (`listProvinces`, `listDistricts`, `listLocalLevels`), which the API
 * limits middleware charges to `catalog_ip` per client network (06 §9.1);
 * the catalog, shop and agreement reads come with their milestones. Route
 * names are the operationIds (docs/09 §3.3).
 */
router
  .group(() => {
    router.get('/locations/provinces', [LocationsController, 'listProvinces']).as('listProvinces')
    router.get('/locations/districts', [LocationsController, 'listDistricts']).as('listDistricts')
    router
      .get('/locations/local-levels', [LocationsController, 'listLocalLevels'])
      .as('listLocalLevels')
  })
  .prefix('/api/v1')
