import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/shield'
import env from '#start/env'
import {
  checkedReportUri,
  definePolicy,
  NONCE,
  omitDirective,
  storageOrigins,
} from '#modules/platform/content_security_policy'

/*
 * Content-Security-Policy (docs/07 §7.3, RF-34, NFR-SEC-007), sent by
 * security_headers_middleware on every answer outside development, where
 * Vite injects inline scripts and a websocket for hot reload.
 *
 * `target` is the policy of docs/07 §7.3. Until M7 it is sent as
 * Content-Security-Policy-Report-Only, so its violations are reported and
 * nothing is blocked. `enforced` is the same policy with inline styles
 * allowed: `<style>` elements without the nonce (sonner's stylesheet on every
 * page, the scroll lock of Radix dialogs) and style attributes (OD-52). M7
 * enforces `target`, once sonner's injection has stopped (docs/07 note 36).
 *
 * The environment-specific origins of 07 §7.3 join with their work: the
 * public media origin (MEDIA_PUBLIC_URL) in img-src and the presigned upload
 * origin (S3_ENDPOINT, path-style, so the URL's origin is the endpoint's) in
 * connect-src joined with the uploads (R1-S part 2d-i), each only when set;
 * the error tracker's browser ingest origin joins with @sentry/react.
 * NONCE is the request's nonce, written unquoted.
 */
const storage = storageOrigins({
  uploadEndpoint: env.get('S3_ENDPOINT'),
  mediaPublicUrl: env.get('MEDIA_PUBLIC_URL'),
})

const target = definePolicy({
  defaultSrc: ["'self'"],
  // The root view's inline theme script for `system` carries the nonce (docs/08 §1.2).
  // 'report-sample': a report quotes the first 40 characters of what was refused.
  scriptSrc: ["'self'", NONCE, "'report-sample'"],
  styleSrc: ["'self'", NONCE, "'report-sample'"],
  styleSrcAttr: ["'unsafe-inline'"],
  // data: for inline images, blob: for the previews of selected files.
  imgSrc: ["'self'", ...storage.imgSrc, 'data:', 'blob:'],
  fontSrc: ["'self'"],
  connectSrc: ["'self'", ...storage.connectSrc],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
})

export const csp = {
  enabled: !app.inDev,
  target,
  // The target with inline styles allowed: `style-src-attr` is then redundant.
  enforced: definePolicy({
    ...omitDirective(target, 'styleSrcAttr'),
    styleSrc: ["'self'", "'unsafe-inline'"],
  }),
  /*
   * The error tracker's CSP report endpoint of the environment's project
   * (docs/11 §9.6). Unset, the browser reports violations only to its console.
   */
  reportUri: checkedReportUri(env.get('CSP_REPORT_URI')),
}

/*
 * The other browser headers of docs/07 §7.3, sent with the CSP headers.
 * Caddy adds Referrer-Policy and Permissions-Policy (docker/Caddyfile).
 */
export const browserHeaders = {
  // Never framed, as frame-ancestors 'none' says for browsers that know CSP.
  frameOptions: 'DENY',
  // 180 days, one year after launch [Assumption, docs/07 §7.3]; subdomains
  // from the first production deploy, preload off (docs/11 §3.2).
  strictTransportSecurity: 'max-age=15552000; includeSubDomains',
}

/*
 * Shield checks CSRF tokens only: it runs in the router middleware, which an
 * unknown URL never reaches, so the browser headers above are set by
 * security_headers_middleware in the server stack instead (docs/07 note 35).
 */
const shieldConfig = defineConfig({
  csrf: {
    /**
     * Enable CSRF token verification for state-changing requests.
     */
    enabled: true,

    /**
     * Route patterns to exclude from CSRF checks.
     * Useful for external webhooks or API endpoints.
     */
    // Only the exact webhook routes of docs/06 §4.1, never a prefix: the courier callback (M6).
    exceptRoutes: (ctx) =>
      ctx.route?.pattern === '/api/v1/webhooks/couriers/:providerCode/:accountId',

    /**
     * Expose an encrypted XSRF-TOKEN cookie for frontend HTTP clients.
     */
    enableXsrfCookie: true,

    /**
     * The XSRF-TOKEN cookie lives as long as the session (config/session.ts
     * `age`). With the 2-hour default of config/app.ts, a form left open
     * longer (a checkout on a phone, say) failed with a CSRF error on submit
     * although the session was still valid.
     */
    cookieOptions: { maxAge: '7d' },

    /**
     * HTTP methods protected by CSRF validation.
     */
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  },
})

export default shieldConfig
