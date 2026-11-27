import string from '@adonisjs/core/helpers/string'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { browserHeaders, csp } from '#config/shield'
import { REPORT_GROUP, serializePolicy } from '#modules/platform/content_security_policy'

/*
 * The browser headers of docs/07 §7.3, set in the server middleware stack so
 * that every answer carries them: routed pages, the API, static files, and
 * the 404 page of an unknown URL, which never reaches the router middleware
 * where Shield runs (docs/07 note 35). Shield keeps CSRF only.
 *
 * Each request gets one nonce (16 random characters, as Shield makes it),
 * shared with the views as `cspNonce` for the root view's inline theme script
 * (docs/08 §1.2). Both CSP headers carry it: the enforced policy and, until
 * M7, the target policy in report-only mode (RF-34). CSP is off in
 * development, where Vite injects inline scripts and a websocket.
 */
/*
 * The pages search engines must not index (ADR-0017 decision 8, docs/03
 * §6.1; R1-S part 3d-iii-a): the seller, account and admin surfaces, the
 * cart and checkout, the sign-in pages and the payment return. Each answer
 * there carries `X-Robots-Tag: noindex`, redirects and errors included,
 * and `robots.txt` does not disallow them, so a crawler sees the header.
 */
export const NOINDEX_PREFIXES = [
  '/seller',
  '/account',
  '/admin',
  '/cart',
  '/checkout',
  '/payments',
  '/login',
  '/signup',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/mfa',
]

export function isNoindexPath(path: string) {
  return NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

export default class SecurityHeadersMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { response } = ctx
    const nonce = string.generateRandom(16)
    response.nonce = nonce
    ctx.view.share({ cspNonce: nonce })

    if (csp.enabled) {
      response.header(
        'Content-Security-Policy',
        serializePolicy(csp.enforced, nonce, csp.reportUri)
      )
      response.header(
        'Content-Security-Policy-Report-Only',
        serializePolicy(csp.target, nonce, csp.reportUri)
      )
      if (csp.reportUri) {
        response.header('Reporting-Endpoints', `${REPORT_GROUP}="${csp.reportUri}"`)
      }
    }
    response.header('X-Frame-Options', browserHeaders.frameOptions)
    response.header('X-Content-Type-Options', 'nosniff')
    response.header('Strict-Transport-Security', browserHeaders.strictTransportSecurity)
    // Every API answer is private and never stored (docs/03 §12.5); a handler may not loosen it.
    if (ctx.request.url().startsWith('/api/v1/'))
      response.header('Cache-Control', 'private, no-store')
    // The private and non-content pages are never indexed, redirects included (ADR-0017 decision 8).
    if (isNoindexPath(ctx.request.url())) response.header('X-Robots-Tag', 'noindex')

    return next()
  }
}
