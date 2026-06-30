/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

import './routes/shops.js'
router.on('/').renderInertia('customers/home/index', {}).as('home')

router
  .group(() => {
    router.get('signup', [controllers.NewAccount, 'create'])
    router.post('signup', [controllers.NewAccount, 'store'])

    router.get('login', [controllers.Session, 'create'])
    router.post('login', [controllers.Session, 'store'])

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

router
  .group(() => {
    router.post('logout', [controllers.Session, 'destroy'])
  })
  .use(middleware.auth())
