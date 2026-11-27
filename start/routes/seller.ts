import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const ShopController = () => import('#controllers/seller/shops/shop_controller')
const ProductsController = () => import('#controllers/seller/catalog/products_controller')
const InventoryController = () => import('#controllers/seller/inventory/inventory_controller')

/*
 * Seller pages (docs/08 §2.5), GET only (ADR-0004 decision 6), rendered in
 * the browser (config/inertia.ts) in the seller layout. Every route runs
 * `auth`, then `sellerContext` on the exact `:shopSlug` segment with the
 * page's one access requirement (T-SEC-005, T-SEC-037; docs/07 §4.5): a
 * guest is sent to `/login` with the page as `return_to` (docs/09 §5.4),
 * and a caller who is not the shop's owner or an active member gets the
 * 404 page of an unknown slug (T-SEC-001). R1-S part 1a builds the
 * overview, 1b `/settings`, 1c `/shipping`, 2f-i the product list, the
 * new product and the product editor, 2f-iv-a `/inventory` and 2f-iv-b
 * `/inventory/:variantId`, a variant's stock history. Each
 * page's controller checks the permission and the status gate of the
 * operation that serves it (docs/07 §4.5 "Page routes"). Page routes keep
 * dotted names (docs/09 §4.3).
 */
router
  .group(() => {
    router.get('/', [ShopController, 'overview']).as('overview')
    router.get('/settings', [ShopController, 'settings']).as('settings')
    router.get('/shipping', [ShopController, 'shipping']).as('shipping')
    router.get('/products', [ProductsController, 'index']).as('products')
    router.get('/products/new', [ProductsController, 'create']).as('products.new')
    router
      .get('/products/:productId', [ProductsController, 'edit'])
      .as('products.edit')
      .where('productId', router.matchers.uuid())
    router.get('/inventory', [InventoryController, 'index']).as('inventory')
    router
      .get('/inventory/:variantId', [InventoryController, 'history'])
      .as('inventory.history')
      .where('variantId', router.matchers.uuid())
  })
  .prefix('/seller/:shopSlug')
  .as('seller')
  .use([middleware.auth(), middleware.sellerContext({ requirement: 'shop.member' })])
