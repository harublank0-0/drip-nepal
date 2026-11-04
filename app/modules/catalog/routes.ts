import router from '@adonisjs/core/services/router'

const CatalogController = () => import('#modules/catalog/controllers/catalog_controller')

/*
 * Public storefront. Open to everyone, logged in or not.
 */
router.get('/', [CatalogController, 'home']).as('home')
router.get('/men', [CatalogController, 'men']).as('men')
router.get('/women', [CatalogController, 'women']).as('women')
router.get('/categories/:slug', [CatalogController, 'category']).as('categories.show')
router.get('/search', [CatalogController, 'search']).as('search')
router.get('/stores/:slug', [CatalogController, 'store']).as('stores.show')
router.get('/products/:slug', [CatalogController, 'product']).as('products.show')

router
  .get('/api/v1/search/suggestions', [CatalogController, 'suggestions'])
  .as('api.search.suggestions')

/*
 * Store policies.
 */
router.on('/returns').renderInertia('legal/returns', {}).as('legal.returns')
router.on('/terms').renderInertia('legal/terms', {}).as('legal.terms')
router.on('/privacy').renderInertia('legal/privacy', {}).as('legal.privacy')
