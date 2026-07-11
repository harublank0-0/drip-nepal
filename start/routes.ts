/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

import './routes/shops.js'

import '#modules/auth/routes'

router.on('/').renderInertia('customers/home/index', {}).as('home')

router
  .group(() => {
    router
      .get('men', ({ inertia }) => {
        return inertia.render('commerce/men/index', {})
      })
      .as('men')

    router
      .get('women', ({ inertia }) => {
        return inertia.render('commerce/women', {})
      })
      .as('women')

    router
      .get('categories/:slug', ({ inertia, params }) => {
        return inertia.render('commerce/categories/show', { slug: params.slug })
      })
      .as('categories.show')

    router
      .get(':attributeValue/:productSlug', ({ inertia }) => {
        return inertia.render('commerce/product_detail/index', {})
      })
      .as('men_product_detail')
  })
  .use(middleware.guest())

// DEBUGS ROUTES
router
  .get('/cart', ({ inertia }) => {
    return inertia.render('commerce/cart/index', {})
  })
  .as('cart')
  .use(middleware.guest())

router
  .get('/checkout', ({ inertia }) => {
    return inertia.render('commerce/checkout/index', {})
  })
  .as('checkout')
  .use(middleware.guest())

router
  .get('/design-system', ({ inertia }) => {
    return inertia.render('design_system/index', {})
  })
  .as('design-system')
  .use(middleware.guest())
