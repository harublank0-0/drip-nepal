import type { HttpContext } from '@adonisjs/core/http'
import { LEGAL_DOCUMENTS, LEGAL_DOCUMENT_SLUGS } from '#modules/platform/legal_documents'
import { legalDocumentLinkJson } from '#transformers/legal_document_transformer'

/*
 * The sign-up and email-verification pages (docs/08 §2.3; 02 J-04; M1 part
 * 2b), server-rendered (ADR-0003). GET only: the forms write through the
 * JSON operations of docs/06 §13.3 (ADR-0004). Routes in
 * start/routes/auth.ts.
 */
export default class RegistrationController {
  /*
   * `/signup`, guests only (`guest`, 02 J-04 "Permissions"). The page links
   * the terms of use and the privacy notice in the versions `signUp`
   * records (01 AC-FR-IAM-001-6), read from the same registry.
   */
  async signUp(ctx: HttpContext) {
    return ctx.inertia.render('auth/signup', {
      legal_documents: LEGAL_DOCUMENT_SLUGS.map((slug) =>
        legalDocumentLinkJson(slug, LEGAL_DOCUMENTS[slug])
      ),
    })
  }

  /*
   * `/verify-email`, signed in or not. The emailed link opens it as
   * `/verify-email?token=…`; the page posts the token to `confirmEmail`, so
   * this GET never reads or redeems it, and a mail scanner that fetches the
   * link verifies nothing. A token page sends no referrer (docs/07 TM-14,
   * §7.3), and is never stored by a browser or a cache: its answer holds the
   * token URL in the page object and, for a signed-in user, their email
   * (docs/07 §7.3, docs/03 §12.5). `account_status` is the signed-in
   * user's status, which decides what the page offers: null without a
   * session ("Sign in to get a new link"), `pending_verification` (the
   * resend button), or `active`. The account-status middleware lets no
   * other status keep a session (docs/07 §3.3 row 1).
   */
  async verifyEmail(ctx: HttpContext) {
    ctx.response.header('Referrer-Policy', 'no-referrer')
    ctx.response.header('Cache-Control', 'no-store')
    const user = ctx.auth.user
    let accountStatus: 'pending_verification' | 'active' | null = null
    if (user) {
      accountStatus = user.status === 'pending_verification' ? 'pending_verification' : 'active'
    }
    return ctx.inertia.render('auth/verify_email', { account_status: accountStatus })
  }
}
