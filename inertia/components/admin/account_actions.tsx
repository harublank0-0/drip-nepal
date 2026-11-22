import { useState } from 'react'
import { MoreHorizontalIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { t } from '~/lib/i18n'
import { AccountStatusDialog } from '~/components/admin/account_status_dialog'
import { allowedChanges, type StatusChange } from '@shared/ui/courier_account_changes'

/*
 * The row actions of a courier account (docs/08 §3.1 "Courier operations"):
 * a menu button named after the account, offering only the changes its
 * status allows (shared/ui/courier_account_changes.ts).
 */
const LABEL = {
  suspended: 'admin.logistics.status.suspend.action',
  pending: 'admin.logistics.status.resume.action',
  disabled: 'admin.logistics.status.disable.action',
} as const

export function AccountActions({
  account,
}: {
  account: { id: string; name: string; status: string }
}) {
  const [change, setChange] = useState<StatusChange | null>(null)
  const changes = allowedChanges(account.status)
  if (changes.length === 0) return null
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('admin.logistics.actions', { name: account.name })}
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {changes.map((next) => (
            <DropdownMenuItem
              key={next}
              variant={next === 'pending' ? 'default' : 'destructive'}
              onSelect={() => setChange(next)}
            >
              {t(LABEL[next])}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {change && (
        <AccountStatusDialog account={account} change={change} onClose={() => setChange(null)} />
      )}
    </>
  )
}
