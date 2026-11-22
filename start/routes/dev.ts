import router from '@adonisjs/core/services/router'

const DevSignInController = () => import('#controllers/dev/sign_in_controller')

/*
 * Development-only routes (RF-40, docs/09 §1.2). `start/routes.ts` imports
 * this file outside production only, so the production route list never
 * holds these routes. Every route here sits under `/dev` and is named
 * `dev.*`; T-UI-026 refuses either in the production route list
 * (scripts/check_routes.mjs).
 */
router
  .group(() => {
    // The component gallery of docs/08 §12.2, in light and dark themes.
    router
      .get('/design-system', ({ inertia }) => inertia.render('dev/design_system/index', {}))
      .as('design_system')
    // Overlay layering and motion checks (docs/08 §5.7, §5.9).
    router.get('/overlays', ({ inertia }) => inertia.render('dev/overlays', {})).as('overlays')
    // The development-only sign-in (docs/07 §3.13): until M1, the way into signed-in pages.
    router.get('/sign-in', [DevSignInController, 'show']).as('sign_in')
    router.post('/sign-in/:id', [DevSignInController, 'store']).as('sign_in.store')
    router.post('/sign-out', [DevSignInController, 'destroy']).as('sign_out')
  })
  .prefix('/dev')
  .as('dev')
