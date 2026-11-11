import env from '#start/env'

/*
 * The keys of docs/07 §5.5, typed for the code that uses them (docs/09
 * §6.3): application code imports this file, never #start/env. Each value is
 * a `Secret` that prints redacted; callers `.release()` it at the point of use.
 */
export const fieldEncryption = {
  keys: env.get('DATA_ENCRYPTION_KEYS'),
  activeKeyId: env.get('DATA_ENCRYPTION_ACTIVE_KEY_ID'),
}

export const blindIndexKey = env.get('BLIND_INDEX_KEY')

export const hmacKeys = {
  limiter: env.get('HMAC_KEY_LIMITER'),
  auditIp: env.get('HMAC_KEY_AUDIT_IP'),
  notifyAddress: env.get('HMAC_KEY_NOTIFY_ADDRESS'),
  // Unset until the error tracker is (docs/09 §5.6).
  telemetry: env.get('HMAC_KEY_TELEMETRY'),
}
