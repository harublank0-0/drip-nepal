import common from '@lang/en/common.json'
import errors from '@lang/en/errors.json'
import account from '@lang/en/account.json'
import auth from '@lang/en/auth.json'
import status from '@lang/en/status.json'
import storefront from '@lang/en/storefront.json'
import { createSurfaceTranslator } from '@shared/i18n/translator'
import { catalogsFor } from '@shared/i18n/surface_catalogs'

/*
 * `t(key, values)` for the UI (docs/08 §11.8, docs/09 §13.10). Every bundle
 * carries common.json and errors.json, and the catalogs of the surfaces
 * built so far that are small or shared: the `StatusBadge` labels of
 * status.json since the courier pages (M6), auth.json and storefront.json
 * since the sign-up pages and the draft legal pages (M1), account.json
 * since the account pages (M1 part 6a). seller.json, the largest, loads
 * with the seller pages (R1-S part 2f-i), and admin.json with the admin
 * pages (R1-S part 3d-iii-b-2): `loadCatalogsFor` fetches it before such a
 * page renders (inertia/app.tsx), so the storefront, auth and account pages
 * do not carry it (T-UI-012). The same catalogs on the server and in the
 * browser keep SSR and hydration equal.
 */
const translator = createSurfaceTranslator(
  {
    common,
    errors,
    account,
    auth,
    status,
    storefront,
  },
  {
    seller: () => import('@lang/en/seller.json'),
    admin: () => import('@lang/en/admin.json'),
  }
)

export const t = translator.t

// Loads the catalogs the page `name` needs before it renders (shared/i18n/surface_catalogs.ts).
export async function loadCatalogsFor(name: string) {
  await Promise.all(catalogsFor(name).map((file) => translator.load(file)))
}
