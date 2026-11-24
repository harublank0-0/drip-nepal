import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { StatusBadge } from '~/components/common/status_badge'
import { AccountActions } from '~/components/admin/account_actions'
import { t } from '~/lib/i18n'
import { formatDateTime } from '@shared/format/date'

/*
 * The courier accounts list of `/admin/logistics` (docs/08 §3.1 "Courier
 * operations", §6.3, §7.2): a table from `md`, with a caption and column
 * headers, inside a labelled region that is its own scroll container and is
 * keyboard-focusable, and one card per account below `md`, with the same
 * fields. Never credentials (T-SEC-040).
 */
export type CourierShop = { shop_id: string; slug: string | null; name: string | null }

export type CourierAccount = {
  id: string
  provider_code: string
  owner_type: string
  name: string
  environment: string
  external_account_ref: string | null
  status: string
  verified_at: string | null
  disabled_at: string | null
  version: number
  shop: CourierShop | null
  shops: (CourierShop & { is_active: boolean })[]
  // A status change needs a `totp_code` from this staff member (OD-44's exception).
  needs_totp_code: boolean
}

function shopName(shop: CourierShop) {
  return shop.name ?? t('admin.logistics.owner.unknown_shop')
}

function owner(account: CourierAccount) {
  return account.shop ? shopName(account.shop) : t('admin.logistics.owner.platform')
}

function environment(account: CourierAccount) {
  return account.environment === 'production'
    ? t('admin.logistics.environment.production')
    : t('admin.logistics.environment.sandbox')
}

function verified(account: CourierAccount) {
  return account.verified_at
    ? formatDateTime(account.verified_at)
    : t('admin.logistics.verified.never')
}

// The shops a platform-owned account serves; a shop's own account serves only that shop.
function allowedShops(account: CourierAccount) {
  if (account.owner_type !== 'platform') return null
  if (account.shops.length === 0) return t('admin.logistics.shops.none')
  return account.shops
    .map((shop) =>
      shop.is_active ? shopName(shop) : t('admin.logistics.shops.removed', { name: shopName(shop) })
    )
    .join(', ')
}

export function CourierAccountsTable({ accounts }: { accounts: CourierAccount[] }) {
  return (
    <>
      <div
        role="region"
        aria-label={t('admin.logistics.table_label')}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling table region is keyboard-focusable (docs/08 §6.3)
        tabIndex={0}
        className="hidden overflow-x-auto rounded-md border md:block"
      >
        {/* ui/table's Table adds its own scroll container, so the table element is written here. */}
        <table className="w-full caption-bottom text-sm">
          <caption className="sr-only">{t('admin.logistics.table_label')}</caption>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead scope="col">{t('admin.logistics.column.name')}</TableHead>
              <TableHead scope="col">{t('admin.logistics.column.owner')}</TableHead>
              <TableHead scope="col">{t('admin.logistics.column.status')}</TableHead>
              <TableHead scope="col">{t('admin.logistics.column.environment')}</TableHead>
              <TableHead scope="col">{t('admin.logistics.column.shops')}</TableHead>
              <TableHead scope="col">{t('admin.logistics.column.verified')}</TableHead>
              <TableHead scope="col">
                <span className="sr-only">{t('admin.logistics.column.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium">{account.name}</TableCell>
                <TableCell>{owner(account)}</TableCell>
                <TableCell>
                  <StatusBadge entity="courier_account" state={account.status} />
                </TableCell>
                <TableCell>{environment(account)}</TableCell>
                <TableCell className="max-w-64 whitespace-normal">
                  {allowedShops(account) ?? owner(account)}
                </TableCell>
                <TableCell>{verified(account)}</TableCell>
                <TableCell className="text-end">
                  <AccountActions account={account} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label={t('admin.logistics.table_label')}>
        {accounts.map((account) => (
          <li key={account.id} className="space-y-2 rounded-md border p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">{account.name}</p>
              <div className="flex items-center gap-1">
                <StatusBadge entity="courier_account" state={account.status} />
                <AccountActions account={account} />
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('admin.logistics.column.owner')}</dt>
              <dd>{owner(account)}</dd>
              <dt className="text-muted-foreground">{t('admin.logistics.column.environment')}</dt>
              <dd>{environment(account)}</dd>
              <dt className="text-muted-foreground">{t('admin.logistics.column.shops')}</dt>
              <dd>{allowedShops(account) ?? owner(account)}</dd>
              <dt className="text-muted-foreground">{t('admin.logistics.column.verified')}</dt>
              <dd>{verified(account)}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}
