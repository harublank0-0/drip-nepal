import { useId } from 'react'
import { useSignOut } from '~/hooks/use_sign_out'
import { PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'

/*
 * The sign-out control (`logOut`, docs/07 §3.11) until the account menus of
 * docs/08 §2.7 exist: the admin top bar shows it next to "Signed in as …",
 * and the header of the auth and public pages, and the interim home page,
 * show it to a signed-in user.
 * While the request runs the button keeps focus and ignores presses
 * (`aria-disabled`, 08 §7.1); a `RATE_LIMITED` wait shows next to it.
 */
export function SignOutButton({ className }: { className?: string }) {
  // A page may show two (the header's and the home page's), so each wait has its own id.
  const rateLimitId = useId()
  const { signOut, pending, retryIn } = useSignOut()
  const blocked = pending || retryIn > 0
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        className={PENDING_BUTTON}
        aria-disabled={blocked || undefined}
        aria-describedby={retryIn > 0 ? rateLimitId : undefined}
        onClick={() => {
          if (!blocked) void signOut()
        }}
      >
        {pending ? t('common.account.signing_out') : t('common.account.sign_out')}
      </Button>
      <RateLimitNotice id={rateLimitId} seconds={retryIn} />
    </span>
  )
}
