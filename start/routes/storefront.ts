import router from '@adonisjs/core/services/router'

const HomeController = () => import('#controllers/storefront/identity/home_controller')
const ListingController = () => import('#controllers/storefront/catalog/listing_controller')
import { NAVIGATION } from '#modules/catalog/navigation'
const LegalDocumentsController = () =>
  import('#controllers/storefront/platform/legal_documents_controller')

/*
 * Storefront and public pages (docs/08 §2.2), GET only (ADR-0004 decision
 * 6), server-rendered (config/inertia.ts), open to everyone: no `guest`
 * here (T-UI-025). M1 adds the interim home page `/` (until M4's home
 * replaces it) and the draft terms of use and privacy notice; the
 * catalogue pages come with M4 and `/legal` with M7. An unknown document
 * slug answers the 404 page from the controller.
 */
router.get('/', [HomeController, 'show']).as('home')
router.get('/legal/:documentSlug', [LegalDocumentsController, 'show']).as('legal.document')

/*
 * The listing pages (docs/08 §2.2, §11.1; R1-S part 3d-i): one fixed route
 * per navigation entry (`/men`, `/men/t-shirts`, …; 04 §3.12, no catch-all,
 * AC-FR-SRCH-007-1), the category pages and the search page.
 */
for (const entry of NAVIGATION) {
  router
    .get(entry.path, [ListingController, 'navigation'])
    .as(`listing.${entry.path.slice(1).replaceAll('/', '.')}`)
}
router
  .get('/c/:categorySlug', [ListingController, 'category'])
  .as('listing.category')
  .where('categorySlug', { match: /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/ })
router.get('/search', [ListingController, 'search']).as('listing.search')
