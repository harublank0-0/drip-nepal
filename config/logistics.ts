import env from '#start/env'

/*
 * Courier configuration (docs/03 §11.6, docs/04a §9.14; M6). Application
 * code imports this file, never #start/env (docs/09 §6.3).
 *
 * - `ncm`: Nepal Can Move hosts per account environment, https only; an
 *   unset host makes every call for that environment `not_configured`.
 * - `callbackKeys`: the key ring that derives each courier account's callback
 *   URL token, and the active key that new URLs use (`COURIER_CALLBACK_KEYS`).
 */
export const courierConfig = {
  ncm: {
    sandbox: env.get('COURIER_NCM_SANDBOX_URL') || null,
    production: env.get('COURIER_NCM_PRODUCTION_URL') || null,
  },
  callbackKeys: env.get('COURIER_CALLBACK_KEYS'),
  callbackActiveKeyId: env.get('COURIER_CALLBACK_ACTIVE_KEY_ID') ?? null,
}
