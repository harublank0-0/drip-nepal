import { readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type { LucidModel, LucidRow } from '@adonisjs/lucid/types/model'
import type { FactoryBuilderQueryContract } from '@adonisjs/lucid/types/factory'

/*
 * T-ARCH-031 (docs/10 §3.4, §6.2): every factory and factory state inserts
 * without a constraint error. The test finds every factory exported from
 * database/factories/ and every state each one defines, so a new factory or
 * state is covered without editing this file, and a CHECK change the
 * factories miss fails here once. Each insert runs inside the test's
 * rolled-back transaction.
 *
 * It also checks the aggregate rules of docs/04 §20.3 on the rows written:
 * no non-anonymised user without a password hash, a product with its
 * default variant and stock row, an active shop with its agreement.
 */

type AnyFactory = FactoryBuilderQueryContract<LucidModel, any>

async function factories() {
  const directory = app.makePath('database/factories')
  const found: { name: string; factory: AnyFactory }[] = []
  const files = await readdir(directory)
  for (const file of files.filter((name) => name.endsWith('_factory.ts'))) {
    const module = await import(pathToFileURL(`${directory}/${file}`).href)
    for (const [name, value] of Object.entries(module)) {
      if (value && typeof value === 'object' && 'factory' in value && 'apply' in value) {
        found.push({ name, factory: value as AnyFactory })
      }
    }
  }
  return found
}

async function checkAggregate(assert: Assert, table: string, row: LucidRow & { id?: string }) {
  if (table === 'users') {
    const result = await db.rawQuery(
      `SELECT count(*)::int AS n FROM users WHERE status <> 'anonymized' AND password_hash IS NULL`
    )
    assert.equal(result.rows[0].n, 0, 'a non-anonymised user without a password hash')
  }
  if (table === 'products') {
    const result = await db.rawQuery(
      `SELECT count(*)::int AS n FROM product_variants v
         JOIN inventory_items i ON i.variant_id = v.id
        WHERE v.product_id = ? AND v.is_default AND v.status = 'active'`,
      [row.id!]
    )
    assert.equal(result.rows[0].n, 1, 'the default variant and its inventory_items row')
  }
  if (table === 'shops') {
    const result = await db.rawQuery(
      `SELECT s.status, count(a.id)::int AS agreements FROM shops s
         LEFT JOIN shop_agreements a ON a.shop_id = s.id WHERE s.id = ? GROUP BY s.status`,
      [row.id!]
    )
    const { status, agreements } = result.rows[0]
    if (status === 'active') assert.equal(agreements, 1, 'an active shop has its agreement')
  }
}

test.group('T-ARCH-031 factories', () => {
  test('T-ARCH-031 every factory and factory state inserts without a constraint error', async ({
    assert,
  }) => {
    const found = await factories()
    assert.includeMembers(
      found.map(({ name }) => name),
      ['UserFactory', 'ShopFactory', 'ProductFactory'],
      'the factories docs/04 §20.3 names'
    )

    for (const { name, factory } of found) {
      const model = factory.factory.model
      const states = [undefined, ...Object.keys(factory.factory.states as object)]
      for (const state of states) {
        const label = state ? `${name}.apply('${state}')` : name
        const builder = state ? factory.apply(state as never) : factory
        const row = await builder.create().catch((error) => {
          assert.fail(`${label} failed to insert: ${error.message}`)
        })
        assert.exists(row, label)
        await checkAggregate(assert, model.table, row as LucidRow & { id?: string })
        // Every state is named after the status it leaves the row in.
        if (state) {
          const stored = await db
            .from(model.table)
            .where('id', (row as any).id)
            .first()
          assert.equal(stored.status, state, `${label} writes status ${state}`)
        }
      }
    }
  })
})
