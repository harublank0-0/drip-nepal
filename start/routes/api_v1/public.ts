import router from '@adonisjs/core/services/router'

const LocationsController = () =>
  import('#controllers/api/v1/public/logistics/locations_controller')
const CatalogController = () => import('#controllers/api/v1/public/catalog/catalog_controller')

/*
 * Public JSON operations (docs/06 §13.2), open to anyone, signed in or not:
 * no `auth` and no `guest`. M1 part 6b adds the address cascades
 * (`listProvinces`, `listDistricts`, `listLocalLevels`), which the API
 * limits middleware charges to `catalog_ip` per client network (06 §9.1);
 * R1-S part 3a adds the category tree and the filterable attributes
 * (`listCategories`, `listAttributes`), on `catalog_ip` too; the product,
 * shop and agreement reads come with their parts. Route
 * names are the operationIds (docs/09 §3.3).
 */
router
  .group(() => {
    router.get('/locations/provinces', [LocationsController, 'listProvinces']).as('listProvinces')
    router.get('/locations/districts', [LocationsController, 'listDistricts']).as('listDistricts')
    router
      .get('/locations/local-levels', [LocationsController, 'listLocalLevels'])
      .as('listLocalLevels')
    router.get('/catalog/categories', [CatalogController, 'listCategories']).as('listCategories')
    router.get('/catalog/attributes', [CatalogController, 'listAttributes']).as('listAttributes')
  })
  .prefix('/api/v1')
