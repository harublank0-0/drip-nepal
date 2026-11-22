import common from '@lang/en/common.json'
import errors from '@lang/en/errors.json'
import admin from '@lang/en/admin.json'
import status from '@lang/en/status.json'
import { createTranslator } from '@shared/i18n/translator'

/*
 * `t(key, values)` for the UI (docs/08 §11.8, docs/09 §13.10). Every bundle
 * carries common.json and errors.json; the surface catalogs (storefront,
 * checkout, seller, admin) join as their surfaces are built: admin.json and
 * the `StatusBadge` labels of status.json since the courier pages (M6). The same
 * catalogs on the server and in the browser keep SSR and hydration equal.
 */
export const t = createTranslator({ common, errors, admin, status })
