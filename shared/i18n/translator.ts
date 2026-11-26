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

// Adds every message of `catalogs` to `messages`, under its file name.
function addCatalogs(messages: Map<string, string>, catalogs: Record<string, Catalog>) {
  for (const [file, catalog] of Object.entries(catalogs)) {
    for (const [key, message] of Object.entries(catalog)) messages.set(`${file}.${key}`, message)
  }
}

// `t` over `messages`, which may still grow: a message compiles on first use.
function translateFrom(messages: Map<string, string>, locale: string): Translate {
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

export function createTranslator<C extends Record<string, Catalog>>(
  catalogs: C,
  locale = 'en'
): Translate<CatalogKey<C>> {
  const messages = new Map<string, string>()
  addCatalogs(messages, catalogs)
  return translateFrom(messages, locale)
}

/*
 * A translator for the browser whose surface catalogs load with their
 * surface (docs/09 §13.10; R1-S part 2f-i): `catalogs` are in every
 * bundle, and each of `later` is a dynamic import, fetched by `load(file)`
 * before the pages that use it render, so its strings stay out of every
 * other page's JavaScript (T-UI-012). The key type covers both, so a typo
 * still fails the typecheck. A load runs once; a failed one is tried again
 * on the next call. Until a catalog has loaded, its keys render as keys,
 * as a missing key does.
 */
export function createSurfaceTranslator<
  C extends Record<string, Catalog>,
  L extends Record<string, Catalog>,
>(
  catalogs: C,
  later: { [F in keyof L]: () => Promise<{ default: L[F] }> },
  locale = 'en'
): { t: Translate<CatalogKey<C & L>>; load: (file: keyof L & string) => Promise<void> } {
  const messages = new Map<string, string>()
  addCatalogs(messages, catalogs)
  const loading = new Map<string, Promise<void>>()
  return {
    t: translateFrom(messages, locale),
    load(file) {
      let pending = loading.get(file)
      if (!pending) {
        pending = later[file]().then(
          (module) => addCatalogs(messages, { [file]: module.default }),
          (error: unknown) => {
            loading.delete(file)
            throw error
          }
        )
        loading.set(file, pending)
      }
      return pending
    },
  }
}
