import { router } from '@inertiajs/react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import type { InertiaProps } from '~/types'

/*
 * The development-only sign-in (docs/07 §3.13), never routed in production.
 * It opens a session as a demo account or as a staff member with TOTP
 * enrolled, without the password, and records the MFA time in place of the
 * challenge of M1 part 5; `/login` is the real sign-in. The demo accounts' password, for
 * password re-entry, is in tmp/dev_credentials.json (docs/09 §8.8).
 */

type Account = { id: string; email: string; full_name: string | null; staff_role: string | null }

type Props = InertiaProps<{
  accounts: Account[]
  staff_without_totp: number
  signed_in_as: string | null
  mfa_verified_at: string | null
}>

export default function DevSignIn({
  accounts,
  staff_without_totp,
  signed_in_as,
  mfa_verified_at,
}: Props) {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Development sign-in</h1>
        <p className="text-muted-foreground">
          Development only: it skips the password and the TOTP code, and production never routes it.
        </p>
      </header>

      <section aria-labelledby="current" className="flex items-center justify-between gap-4">
        <h2 id="current" className="text-base">
          {signed_in_as ? `Signed in as ${signed_in_as}` : 'Not signed in'}
        </h2>
        {signed_in_as && (
          <Button variant="outline" onClick={() => router.post('/dev/sign-out')}>
            Sign out
          </Button>
        )}
      </section>

      {mfa_verified_at && (
        <p className="text-muted-foreground text-sm">
          MFA recorded at {mfa_verified_at}: admin pages for 12 hours, step-up for 15 minutes. Sign
          in again to renew.
        </p>
      )}

      <section aria-labelledby="accounts" className="space-y-3">
        <h2 id="accounts" className="text-lg font-semibold">
          Accounts
        </h2>
        {accounts.length === 0 ? (
          <p className="text-muted-foreground">
            No account to sign in as. Run <code>node ace db:seed</code> for the demo accounts, and{' '}
            <code>node ace platform:create-admin --interactive</code> for a staff account.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{account.email}</p>
                  {account.full_name && (
                    <p className="text-muted-foreground truncate text-sm">{account.full_name}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {account.staff_role && <Badge variant="secondary">{account.staff_role}</Badge>}
                  <Button
                    onClick={() => router.post(`/dev/sign-in/${account.id}`)}
                    aria-label={`Sign in as ${account.email}`}
                  >
                    Sign in
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {staff_without_totp > 0 && (
          <p className="text-muted-foreground text-sm">
            {staff_without_totp} staff account(s) have no TOTP yet. Run{' '}
            <code>node ace db:seed</code> to give them the placeholder enrolment.
          </p>
        )}
      </section>
    </main>
  )
}
