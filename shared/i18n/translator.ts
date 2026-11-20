import { IntlMessageFormat, type PrimitiveType } from 'intl-messageformat'

/*
 * The message catalogs of docs/08 §11.8: UI text lives in
 * resources/lang/en/*.json as ICU MessageFormat, so the R2 Nepali UI is a
 * new catalog, not a code change (A-10, NFR-I18N-001). Keys are the file
 * name and the dotted key inside it: `errors.not_found.title` is
 * `not_found.title` in errors.json (docs/09 §13.10). A missing key renders
 * as itself, so it shows up on the page instead of failing it.
 */
export type Catalog = Record<string, string>
export type Translate = (key: string, values?: Record<string, PrimitiveType>) => string

export function createTranslator(catalogs: Record<string, Catalog>, locale = 'en'): Translate {
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
    return String(format.format(values))
  }
}
