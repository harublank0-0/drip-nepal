/*
 * Who performs an action, as the audit row and the event rows record it
 * (docs/04a §15.3, §11.6). The HTTP layer builds it from the session; job
 * rows write the actor `system` themselves. Never personal data: `role` is `shop:<id>:<role>` or
 * `platform:<role>` (docs/04a §15.3).
 */
export type Actor = {
  type: 'shop_member' | 'platform_staff' | 'system'
  userId: string | null
  role: string | null
  requestId: string | null
  ipHash?: Buffer | null
}
