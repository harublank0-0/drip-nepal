/*
 * The catalogs a surface's pages load before they render (docs/09 §13.10;
 * R1-S part 2f-i), by page name prefix: `seller.json` for the seller pages,
 * whose strings are used nowhere else, so the storefront, auth and account
 * pages do not carry them (T-UI-012, the 250 KB storefront budget). The
 * server-rendered surfaces (storefront, auth, payments, errors) need no
 * catalog from here: theirs are in every bundle.
 */
export const LATER_CATALOGS = { seller: 'seller/' } as const

export type LaterCatalog = keyof typeof LATER_CATALOGS

export function catalogsFor(page: string): LaterCatalog[] {
  return (Object.keys(LATER_CATALOGS) as LaterCatalog[]).filter((file) =>
    page.startsWith(LATER_CATALOGS[file])
  )
}
