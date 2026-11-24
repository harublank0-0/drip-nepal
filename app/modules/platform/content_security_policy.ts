/*
 * Content-Security-Policy headers (docs/07 §7.3, RF-34, NFR-SEC-007).
 *
 * A policy is a map of directives in camelCase (`defaultSrc`), each with its
 * source values written as they are sent: keywords keep their quotes
 * (`'self'`), and NONCE stands for the request's nonce. serializePolicy()
 * writes one header value for one request. The policies themselves are in
 * config/shield.ts; security_headers_middleware sends them.
 */

/** The request's nonce, written unquoted, as Shield's `@nonce` keyword is. */
export const NONCE = '@nonce'

/** The reporting group that `report-to` names and `Reporting-Endpoints` defines. */
export const REPORT_GROUP = 'csp-endpoint'

export type CspPolicy = Readonly<Record<string, readonly string[]>>

// CSP keywords, which are sources only when quoted; a bare `self` is a host.
const KEYWORDS = new Set([
  'self',
  'none',
  'unsafe-inline',
  'unsafe-eval',
  'unsafe-hashes',
  'strict-dynamic',
  'report-sample',
  'wasm-unsafe-eval',
  'inline-speculation-rules',
])

// Nonce and hash sources, which also need their quotes.
const QUOTED_PREFIXES = /^(nonce|sha256|sha384|sha512)-/

// A directive name in camelCase, written with a dash in the header (`defaultSrc`).
const DIRECTIVE_NAME = /^[a-z]+(?:[A-Z][a-z]*)*$/

/*
 * Checks a policy once, where it is defined, so no request can send a broken
 * header. A value is one token: no space, `;` or `,`, which would split it
 * into other sources or directives. A quoted nonce keyword would be sent
 * literally and block every nonced script once enforced (docs/07 §7.3); an
 * unquoted keyword, nonce or hash would be read as a host name.
 */
export function definePolicy<const Policy extends Record<string, readonly string[]>>(
  policy: Policy
): Policy {
  for (const [directive, values] of Object.entries(policy)) {
    if (!DIRECTIVE_NAME.test(directive)) throw new Error(`CSP ${directive}: not a directive name`)
    if (values.length === 0) throw new Error(`CSP ${directive}: no source values`)
    for (const value of values) {
      if (value === '' || /[\s;,]/.test(value)) {
        throw new Error(`CSP ${directive}: "${value}" is not one source value`)
      }
      if (value === `'${NONCE}'`) {
        throw new Error(`CSP ${directive}: write the nonce keyword unquoted, as ${NONCE}`)
      }
      if (KEYWORDS.has(value) || QUOTED_PREFIXES.test(value)) {
        throw new Error(`CSP ${directive}: ${value} must be quoted, as '${value}'`)
      }
    }
    Object.freeze(values)
  }
  return Object.freeze(policy)
}

/*
 * The storage origins of docs/07 §7.3 (R1-S part 2d-i): the presigned upload
 * origin for `connect-src`, which is S3_ENDPOINT's because uploads are
 * path-style, and the public media origin for `img-src`, each the URL's
 * origin only (no path), and none when its setting is unset.
 */
export function storageOrigins(settings: { uploadEndpoint?: string; mediaPublicUrl?: string }) {
  const origin = (url?: string) => (url ? [new URL(url).origin] : [])
  return {
    connectSrc: origin(settings.uploadEndpoint),
    imgSrc: origin(settings.mediaPublicUrl),
  }
}

/** A copy of a policy without one directive; the others keep their order and types. */
export function omitDirective<Policy extends CspPolicy, Name extends keyof Policy & string>(
  policy: Policy,
  name: Name
): Omit<Policy, Name> {
  return Object.fromEntries(Object.entries(policy).filter(([key]) => key !== name)) as Omit<
    Policy,
    Name
  >
}

/*
 * The report endpoint, checked at boot: it is written into both CSP headers
 * and into the quoted string of `Reporting-Endpoints`, so a space, `;`, `,`
 * or `"` would split a directive or the header.
 */
export function checkedReportUri(uri: string | undefined): string | undefined {
  if (uri && /[\s;,"]/.test(uri)) {
    throw new Error('CSP_REPORT_URI must not contain spaces, ";", "," or a double quote')
  }
  return uri
}

const directiveName = (name: string) =>
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

/*
 * One header value: the directives in their defined order, the nonce resolved,
 * then `report-uri` and `report-to` when a report endpoint is configured.
 */
export function serializePolicy(policy: CspPolicy, nonce: string, reportUri?: string): string {
  const directives = Object.entries(policy).map(
    ([name, values]) =>
      `${directiveName(name)} ${values.map((value) => (value === NONCE ? `'nonce-${nonce}'` : value)).join(' ')}`
  )
  if (reportUri) directives.push(`report-uri ${reportUri}`, `report-to ${REPORT_GROUP}`)
  return directives.join('; ')
}
