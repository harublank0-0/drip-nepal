import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import { client, urlFor } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { t } from '~/lib/i18n'

/*
 * Signing out (`logOut`, docs/06 §13.3; docs/07 §3.11; AC-FR-IAM-003-6).
 * The server ends the session; its 204 cannot touch the browser's history,
 * so on success the client clears Inertia's history first, then visits
 * `/login`, replacing the current entry, and that page renders with
 * `clearHistory` too. Back then cannot show the account's pages on a shared
 * phone. A 401, or a 403 `ACCOUNT_SUSPENDED`, means the session was already
 * gone or has just been ended by the account check (docs/07 §3.3): the
 * outcome asked for, handled the same way. Form drafts in
 * `sessionStorage` (docs/08 §7.1) are removed here, before the visit, once
 * a form keeps one (checkout, M5).
 *
 * Any other failure keeps the user signed in and says so in a toast, with
 * the reference support asks for (08 §8.3); `retryIn` is the `RATE_LIMITED`
 * wait of `useApiMutation`, which callers show next to the button.
 */
// The account check of docs/07 §3.3 answers these after ending the session itself.
const ENDED: ReadonlySet<string> = new Set(['UNAUTHENTICATED', 'ACCOUNT_SUSPENDED'])

export function useSignOut() {
  const mutation = useApiMutation({ signInOnUnauthenticated: false })

  async function signOut() {
    const outcome = await mutation.run(() => client.request('logOut', { timeout: 30_000 }))
    if (!outcome) return
    // Signed out now, or already: the account check ended the session first (401 or 403).
    if (outcome.ok || ('problem' in outcome && ENDED.has(outcome.problem.code))) {
      router.clearHistory()
      router.visit(urlFor('login'), { replace: true })
      return
    }
    if ('offline' in outcome) {
      toast.error(t('common.form.offline'))
      return
    }
    if (outcome.problem.code === 'RATE_LIMITED') return
    toast.error(t('common.account.sign_out_failed'), {
      description: t('common.form.reference', { id: outcome.problem.request_id }),
    })
  }

  return { signOut, pending: mutation.pending, retryIn: mutation.retryIn }
}
