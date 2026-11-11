/*
 * The problem-code registry (docs/06 §5.2, ADR-0018 decision 4): every code
 * the API may answer, with its status and fixed English title. The list is
 * exactly the 06 §5.2 table and the `ProblemCode` enum of docs/openapi.yaml;
 * T-API-011 compares the three. Titles match the problem examples of
 * openapi.yaml, which T-API-011 also checks.
 *
 * `proposed` codes are listed in 06 §5.2 but not adopted yet, so no code may
 * throw them (docs/09 §5.2): the kill switch throws `PROVIDER_UNAVAILABLE`
 * with no `Retry-After`, and a malformed body answers 422 `VALIDATION_FAILED`.
 */
export const PROBLEM_CODES = {
  INVALID_QUERY_PARAMETER: { status: 400, title: 'Invalid query parameter' },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, title: 'Idempotency key required' },
  MALFORMED_REQUEST: { status: 400, title: 'Malformed request', proposed: true },
  UNAUTHENTICATED: { status: 401, title: 'Authentication required' },
  MFA_REQUIRED: { status: 401, title: 'Multi-factor authentication required' },
  FORBIDDEN: { status: 403, title: 'Forbidden' },
  ACCOUNT_SUSPENDED: { status: 403, title: 'Account suspended' },
  SHOP_NOT_ACTIVE: { status: 403, title: 'Shop not active' },
  EMAIL_NOT_VERIFIED: { status: 403, title: 'Email not verified' },
  NOT_FOUND: { status: 404, title: 'Not found' },
  CONFLICT: { status: 409, title: 'Conflict' },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, title: 'Request in progress' },
  OUT_OF_STOCK: { status: 409, title: 'Out of stock' },
  PRICE_CHANGED: { status: 409, title: 'Price changed' },
  CART_CHANGED: { status: 409, title: 'Cart changed' },
  INVALID_STATE_TRANSITION: { status: 409, title: 'Invalid state transition' },
  VERSION_CONFLICT: { status: 412, title: 'Version conflict' },
  PAYLOAD_TOO_LARGE: { status: 413, title: 'Payload too large' },
  VALIDATION_FAILED: { status: 422, title: 'Validation failed' },
  IDEMPOTENCY_KEY_REUSED: { status: 422, title: 'Idempotency key reused' },
  DELIVERY_NOT_AVAILABLE: { status: 422, title: 'Delivery not available' },
  COD_LIMIT_EXCEEDED: { status: 422, title: 'Cash on delivery limit exceeded' },
  REFUND_EXCEEDS_REFUNDABLE: { status: 422, title: 'Refund exceeds refundable amount' },
  PRECONDITION_REQUIRED: { status: 428, title: 'Precondition required' },
  RATE_LIMITED: { status: 429, title: 'Too many requests' },
  INTERNAL: { status: 500, title: 'Something went wrong' },
  PROVIDER_UNAVAILABLE: { status: 503, title: 'Provider unavailable' },
  CHECKOUT_DISABLED: { status: 503, title: 'Checkout is paused', proposed: true },
  SERVICE_BUSY: { status: 503, title: 'Service busy', proposed: true },
} as const satisfies Record<string, { status: number; title: string; proposed?: true }>

export type ProblemCode = keyof typeof PROBLEM_CODES

// The production domain is an [Assumption] (ADR-0018, docs/06 §5.1).
export function problemType(code: ProblemCode) {
  return `https://dripnepal.com/problems/${code.toLowerCase().replaceAll('_', '-')}`
}

export function isProposed(code: ProblemCode) {
  return 'proposed' in PROBLEM_CODES[code]
}
