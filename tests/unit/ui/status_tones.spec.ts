import { readFile } from 'node:fs/promises'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { STATUS_TONES, toneOf } from '#shared/ui/status_tones'
import { LOGISTICS_ACCOUNT_STATUSES } from '#modules/logistics/domain/logistics_account_status'
import { SHOP_STATUSES } from '#modules/shops/domain/shop_status'
import { PRODUCT_STATUSES } from '#modules/catalog/domain/product_status'

/*
 * T-UI-008, every status value has a label (docs/08 §7.5): for each entity
 * `StatusBadge` maps, the map holds exactly the states of its domain
 * vocabulary (the array its 04a CHECK is built from), and status.json has a
 * label for each. Entities join as their pages are built.
 */

const VOCABULARIES: Record<keyof typeof STATUS_TONES, readonly string[]> = {
  courier_account: LOGISTICS_ACCOUNT_STATUSES,
  product: PRODUCT_STATUSES,
  shop: SHOP_STATUSES,
}

async function labels() {
  const text = await readFile(app.makePath('resources/lang/en/status.json'), 'utf8')
  return JSON.parse(text) as Record<string, string>
}

test.group('T-UI-008 status labels', () => {
  test('T-UI-008 {entity} maps every state of its vocabulary, and nothing else')
    .with(Object.keys(VOCABULARIES).map((entity) => ({ entity })))
    .run(({ assert }, { entity }) => {
      const key = entity as keyof typeof STATUS_TONES
      assert.sameMembers(Object.keys(STATUS_TONES[key]), [...VOCABULARIES[key]])
    })

  test('T-UI-008 every mapped state has a label in status.json', async ({ assert }) => {
    const catalog = await labels()
    for (const [entity, tones] of Object.entries(STATUS_TONES)) {
      for (const state of Object.keys(tones)) {
        assert.isString(catalog[`${entity}.${state}`], `${entity}.${state}`)
      }
    }
  })

  test('T-UI-008 an unknown state has no tone, so the badge shows its raw name', ({ assert }) => {
    assert.isNull(toneOf('courier_account', 'paused'))
    assert.isNull(toneOf('courier_account', 'toString'))
    assert.equal(toneOf('courier_account', 'active'), 'success')
  })
})
