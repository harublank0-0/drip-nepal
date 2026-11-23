import type { HttpContext } from '@adonisjs/core/http'

/*
 * The sign-in page (docs/08 §2.3; 02 J-04 step 5; M1 part 3), for guests
 * (`guest`), server-rendered in the auth layout (ADR-0003). GET only: the
 * form signs in through `logIn` (ADR-0004). Route in start/routes/auth.ts.
 *
 * `notice` is the one flash the page reads: `account_suspended`, which the
 * exception handler flashes when the account check of docs/07 §3.3 ends a
 * suspended user's session on a page visit, so the page says why; and
 * `deletion_requested`, which `requestAccountDeletion` flashes into the
 * guest session it leaves (M1 part 6a), so the page the client visits next
 * says the account is closed. The page
 * reads `return_to` from its own URL and hands it to `logIn` unchanged
 * (docs/07 TM-14); this controller never looks at it. Like every page
 * rendered without a signed-in user, it renders with `clearHistory`
 * (InertiaMiddleware, docs/07 §3.11).
 */
const LOGIN_NOTICES = ['account_suspended', 'deletion_requested'] as const
type LoginNotice = (typeof LOGIN_NOTICES)[number]

const isNotice = (value: unknown): value is LoginNotice =>
  (LOGIN_NOTICES as readonly unknown[]).includes(value)

export default class SessionController {
  async logIn(ctx: HttpContext) {
    const flashed = ctx.session.flashMessages.get('notice')
    const notice: LoginNotice | null = isNotice(flashed) ? flashed : null
    return ctx.inertia.render('auth/login', { notice })
  }
}
