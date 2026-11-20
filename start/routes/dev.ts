import router from '@adonisjs/core/services/router'

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
  })
  .prefix('/dev')
  .as('dev')
