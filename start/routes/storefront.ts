import router from '@adonisjs/core/services/router'

const LegalDocumentsController = () =>
  import('#controllers/storefront/platform/legal_documents_controller')

/*
 * Storefront and public pages (docs/08 §2.2), GET only (ADR-0004 decision
 * 6), server-rendered (config/inertia.ts), open to everyone: no `guest`
 * here (T-UI-025). M1 adds the draft terms of use and privacy notice; the
 * catalogue pages come with M4 and `/legal` with M7. An unknown document
 * slug answers the 404 page from the controller.
 */
router.get('/legal/:documentSlug', [LegalDocumentsController, 'show']).as('legal.document')
