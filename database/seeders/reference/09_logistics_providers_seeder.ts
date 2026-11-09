import { BaseSeeder } from '@adonisjs/lucid/seeders'

/*
 * The courier registry of docs/04 §21.6 [Assumption A-53]: one row for
 * Nepal Can Move, upserted by `code` (docs/04a §9.8, docs/09 §8.8). Its
 * `capabilities` stay `{}` until VX-16 is answered (OD-56). Never deleted:
 * a courier DripNepal stops working with gets `is_active = false` here.
 * No courier account is seeded: accounts hold credentials (docs/04a §9.9).
 */
export const LOGISTICS_PROVIDERS = [
  { code: 'ncm', name: 'Nepal Can Move', isActive: true, capabilities: {} },
] as const

export default class LogisticsProvidersSeeder extends BaseSeeder {
  async run() {
    await this.client.transaction(async (trx) => {
      for (const provider of LOGISTICS_PROVIDERS) {
        await trx.rawQuery(
          `INSERT INTO logistics_providers (code, name, is_active, capabilities)
           VALUES (?, ?, ?, ?::jsonb)
           ON CONFLICT (code) DO UPDATE
              SET name = EXCLUDED.name, is_active = EXCLUDED.is_active,
                  capabilities = EXCLUDED.capabilities
            WHERE (logistics_providers.name, logistics_providers.is_active,
                   logistics_providers.capabilities)
                  IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.is_active, EXCLUDED.capabilities)`,
          [provider.code, provider.name, provider.isActive, JSON.stringify(provider.capabilities)]
        )
      }
    })
  }
}
