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

    return next()
  }
}
