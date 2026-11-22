import { t } from '~/lib/i18n'

/*
 * The header of the public pages until M4 builds the storefront header of
 * docs/08 §2.7 (brand, navigation, search, account, cart): the brand mark
 * alone, linking home. A plain link, because the home page `/` is a route
 * of M4; until then it opens the 404 page. The crimson accent marks the
 * brand only (08 §1.1).
 */
export function SiteHeader() {
  return (
    <header className="px-4 py-4 md:px-6">
      <a
        href="/"
        className="font-heading text-primary rounded-sm text-xl font-semibold tracking-tight"
      >
        {t('common.brand')}
      </a>
    </header>
  )
}
