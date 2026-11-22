import { Head, usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { EmptyState } from '~/components/common/empty_state'
import { CreatePlatformAccountDialog } from '~/components/admin/create_platform_account_dialog'
import { ACCOUNTS_HEADING_ID } from '~/components/admin/account_actions'
import {
  CourierAccountsTable,
  type CourierAccount,
} from '~/components/admin/courier_accounts_table'

/*
 * `/admin/logistics` (docs/08 §2.6, §3.1 "Courier operations"): the courier
 * accounts, shop-owned and DripNepal's, one cursor page at a time; staff add
 * DripNepal's account and suspend, resume or disable any account. Re-keying
 * and the allowed shops join next (docs/12 §5.6).
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
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            {/* Focus lands here when a change removes the row's actions (08 §7.3 rule 1). */}
            <h1
              id={ACCOUNTS_HEADING_ID}
              tabIndex={-1}
              className="text-2xl font-semibold outline-none"
            >
              {t('admin.logistics.title')}
            </h1>
            <p className="text-muted-foreground max-w-prose">{t('admin.logistics.intro')}</p>
          </div>
          <CreatePlatformAccountDialog />
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
          <nav className="flex gap-4" aria-label={t('admin.logistics.pages')}>
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
