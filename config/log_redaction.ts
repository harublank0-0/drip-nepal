/*
 * The pino redaction paths (docs/09 §7.2, docs/07 TM-27). Redaction is a
 * backstop: code logs identifiers, not data (docs/09 §7.3). Pino paths are
 * case-sensitive, with `*` matching one level, so the list covers the shapes
 * the code logs: top level and one level down. A constant, never built from
 * input (pino's redaction "Safety" note).
 */

const withNested = (keys: string[]) => keys.flatMap((key) => [key, `*.${key}`])

const HEADER_KEYS = [
  'authorization',
  'cookie',
  '["set-cookie"]',
  '["x-xsrf-token"]',
  '["x-csrf-token"]',
  '["idempotency-key"]',
]
const header = (prefix: string) =>
  HEADER_KEYS.map((key) => (key.startsWith('[') ? `${prefix}${key}` : `${prefix}.${key}`))

export const REDACT_PATHS: string[] = [
  // Credentials
  ...withNested(['password', 'current_password', 'new_password', 'totp_code', 'secret']),
  // Tokens; an idempotency key can be replayed for 24–72 h (docs/06 §7)
  ...withNested(['token', 'token_enc']),
  'idempotency_key',
  // HTTP headers, under `headers`, `req.headers` and `res.headers`, and the bare keys
  ...header('headers'),
  ...header('req.headers'),
  ...header('res.headers'),
  ...withNested(['authorization', 'cookie']),
  // Personal contact
  ...withNested(['email', 'phone', 'address', 'recipient', 'recipient_phone']),
  // Money-routing secrets
  ...withNested(['account_number', 'recipient_details']),
  // Database errors: PostgreSQL quotes key values in `detail`
  // ("Key (email)=(…) already exists"). The body parser puts the raw request
  // body on the SyntaxError of a malformed JSON body.
  'err.detail',
  'error.detail',
  'err.body',
  'error.body',
]

export const REDACT_CENSOR = '[redacted]'
