import { AuditLogSchema } from '#database/schema'

/* docs/04a §15.3 (audit). Append-only, with no foreign keys (docs/04 §4.5). */
export default class AuditLog extends AuditLogSchema {}
