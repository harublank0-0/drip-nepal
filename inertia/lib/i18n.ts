import common from '@lang/en/common.json'
import errors from '@lang/en/errors.json'
import { createTranslator } from '@shared/i18n/translator'

/*
 * `t(key, values)` for the UI (docs/08 §11.8, docs/09 §13.10). Every bundle
 * carries common.json and errors.json; the surface catalogs (storefront,
 * checkout, seller, admin) join as M1 to M4 build those surfaces. The same
 * catalogs on the server and in the browser keep SSR and hydration equal.
 */
export const t = createTranslator({ common, errors })
