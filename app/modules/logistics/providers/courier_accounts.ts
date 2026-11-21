import { decryptField } from '#modules/platform/crypto/field_decrypter'
import type { LogisticsEnvironment } from '#modules/logistics/domain/logistics_environment'
import type { CourierAccount } from '#modules/logistics/providers/courier_provider'

/*
 * The `CourierAccount` an adapter call receives (docs/04a §9.9, ADR-0019
 * decision 5): its credentials are decrypted only when the call asks for
 * them, inside that call (docs/07 §5.5), and never kept. A value that does
 * not parse as the courier's documented JSON makes the thunk throw, which the
 * adapter answers as `credentials_unavailable` without a call.
 */
export const CREDENTIALS_AAD = 'logistics_accounts.credentials_enc'

export type StoredAccount = {
  id: string
  environment: string
  credentialsEnc: string | null
}

export function courierAccountFrom(row: StoredAccount): CourierAccount {
  return {
    id: row.id,
    environment: row.environment as LogisticsEnvironment,
    credentials: async () => {
      if (!row.credentialsEnc) throw new Error('no credentials')
      const parsed: unknown = JSON.parse(decryptField(row.credentialsEnc, CREDENTIALS_AAD))
      const token =
        parsed && typeof parsed === 'object' ? (parsed as { token?: unknown }).token : undefined
      if (typeof token !== 'string') throw new Error('credentials without a token')
      return { token }
    },
  }
}
