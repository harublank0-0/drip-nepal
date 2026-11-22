import { Head, usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { EmptyState } from '~/components/common/empty_state'
import {
  CourierAccountsTable,
  type CourierAccount,
} from '~/components/admin/courier_accounts_table'

/*
 * `/admin/logistics` (docs/08 §2.6, §3.1 "Courier operations"): the courier
 * accounts, shop-owned and DripNepal's, one cursor page at a time. The
 * account actions join in the next pull request (docs/12 §5.6).
 */
type Props = InertiaProps<{
  accounts: { items: CourierAccount[]; meta: { limit: number; next_cursor: string | null } }
}>

export default function AdminLogistics({ accounts }: Props) {
  const next = accounts.meta.next_cursor
  // A later page carries a cursor in its URL; 08 §7.2 offers the way back.
  const onLaterPage = usePage().url.includes('cursor=')
  return (
    <>
      <Head title={t('admin.logistics.title')} />
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">{t('admin.logistics.title')}</h1>
          <p className="text-muted-foreground max-w-prose">{t('admin.logistics.intro')}</p>
        </header>
        {accounts.items.length === 0 ? (
          <EmptyState
            heading={t('admin.logistics.empty.heading')}
            body={t('admin.logistics.empty.body')}
          />
        ) : (
          <CourierAccountsTable accounts={accounts.items} />
        )}
        {(next || onLaterPage) && (
          <nav className="flex gap-4" aria-label={t('admin.logistics.table_label')}>
            {onLaterPage && (
              <Link
                route="admin.logistics"
                className="text-link underline-offset-4 hover:underline"
              >
                {t('admin.logistics.first_page')}
              </Link>
            )}
            {next && (
              <Link
                route="admin.logistics"
                qs={{ cursor: next }}
                className="text-link underline-offset-4 hover:underline"
              >
                {t('admin.logistics.next_page')}
              </Link>
            )}
          </nav>
        )}
      </div>
    </>
  )
}
