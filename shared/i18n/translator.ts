import { IntlMessageFormat, type PrimitiveType } from 'intl-messageformat'

/*
 * The message catalogs of docs/08 §11.8: UI text lives in
 * resources/lang/en/*.json as ICU MessageFormat, so the R2 Nepali UI is a
 * new catalog, not a code change (A-10, NFR-I18N-001). Keys are the file
 * name and the dotted key inside it: `errors.not_found.title` is
 * `not_found.title` in errors.json (docs/09 §13.10). With the catalogs
 * imported as JSON, the key type lists every key, so a typo fails the
 * typecheck. A key or a placeholder value that is still missing at run
 * time renders the key, so it shows on the page instead of failing a
 * server render.
 */
export type Catalog = Record<string, string>
export type CatalogKey<C extends Record<string, Catalog>> = {
  [F in keyof C & string]: `${F}.${keyof C[F] & string}`
}[keyof C & string]
export type Translate<K extends string = string> = (
  key: K,
  values?: Record<string, PrimitiveType>
) => string

export function createTranslator<C extends Record<string, Catalog>>(
  catalogs: C,
  locale = 'en'
): Translate<CatalogKey<C>> {
  const messages = new Map<string, string>()
  for (const [file, catalog] of Object.entries(catalogs)) {
    for (const [key, message] of Object.entries(catalog)) messages.set(`${file}.${key}`, message)
  }
  const compiled = new Map<string, IntlMessageFormat>()
  return (key, values) => {
    const message = messages.get(key)
    if (message === undefined) return key
    let format = compiled.get(key)
    if (!format) {
      format = new IntlMessageFormat(message, locale)
      compiled.set(key, format)
    }
    try {
      return String(format.format(values))
    } catch {
      return key
    }
  }
}
