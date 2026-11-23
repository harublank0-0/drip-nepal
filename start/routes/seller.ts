import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const ShopController = () => import('#controllers/seller/shops/shop_controller')

/*
 * Seller pages (docs/08 §2.5), GET only (ADR-0004 decision 6), rendered in
 * the browser (config/inertia.ts) in the seller layout. Every route runs
 * `auth`, then `sellerContext` on the exact `:shopSlug` segment with the
 * page's one access requirement (T-SEC-005, T-SEC-037; docs/07 §4.5): a
 * guest is sent to `/login` with the page as `return_to` (docs/09 §5.4),
 * and a caller who is not the shop's owner or an active member gets the
 * 404 page of an unknown slug (T-SEC-001). R1-S part 1a builds the
 * overview; 1b adds `/settings` and 1c `/shipping`. Page routes keep
 * dotted names (docs/09 §4.3).
 */
router
  .group(() => {
    router.get('/', [ShopController, 'overview']).as('overview')
  })
  .prefix('/seller/:shopSlug')
  .as('seller')
  .use([middleware.auth(), middleware.sellerContext({ requirement: 'shop.member' })])
