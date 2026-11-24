import { useRef, useState } from 'react'
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
 * status allows (shared/ui/courier_account_changes.ts). The dialog it opens
 * has no trigger of its own, so focus goes back to this button when it
 * closes, or to the page heading when the change leaves no action and the
 * button goes (docs/08 §7.3 rule 1).
 */
export const ACCOUNTS_HEADING_ID = 'courier-accounts-heading'

const LABEL = {
  suspended: 'admin.logistics.status.suspend.action',
  pending: 'admin.logistics.status.resume.action',
  disabled: 'admin.logistics.status.disable.action',
} as const

export function AccountActions({
  account,
}: {
  account: { id: string; name: string; status: string; needs_totp_code?: boolean }
}) {
  // Mounted from the first choice on, so the dialog is never unmounted while open.
  const [change, setChange] = useState<StatusChange | null>(null)
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const buttonGoes = useRef(false)
  const changes = allowedChanges(account.status)
  // A reload can leave no action while the dialog still shows its answer; it stays until closed.
  if (changes.length === 0 && !open) return null
  return (
    <>
      {changes.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={trigger}
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
                onSelect={() => {
                  buttonGoes.current = false
                  setChange(next)
                  setOpen(true)
                }}
              >
                {t(LABEL[next])}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {change && (
        <AccountStatusDialog
          account={account}
          change={change}
          open={open}
          onOpenChange={setOpen}
          onChanged={(status) => {
            buttonGoes.current = allowedChanges(status).length === 0
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const button = trigger.current
            if (!buttonGoes.current && button?.isConnected) button.focus()
            else document.getElementById(ACCOUNTS_HEADING_ID)?.focus()
          }}
        />
      )}
    </>
  )
}
