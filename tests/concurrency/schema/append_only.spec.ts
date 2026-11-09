import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  insertInventoryItem,
  insertOrder,
  insertShop,
  insertShopOrder,
  insertUser,
  insertVariant,
  orderNumber,
} from '#tests/support/schema_rows'
import { MIGRATOR_CONNECTION } from '#tests/support/database'

/*
 * T-ARCH-012 (docs/04 §2.12, docs/07 §4.10, docs/10 §6.2): the append-only
 * tables refuse UPDATE and DELETE for both roles. `dripnepal_app` (the
 * default connection) is stopped by its missing privileges, SQLSTATE 42501;
 * `dripnepal_migrator` (the `pg_migrator` connection), which owns the
 * tables, by the `forbid_mutation()` triggers, P0001. TRUNCATE is refused
 * the same way. The retention exemption (proposed, OD-51) lets the migrator
 * DELETE a row, or change only `support_case_messages.body`, while
 * `dripnepal.retention_purge` is `on`; every other UPDATE still fails, and
 * the setting gives `dripnepal_app` nothing.
 *
 * It sits in the concurrency suite because it needs the second role and
 * committed rows (docs/10 §3.3). Each attempt runs in its own transaction
 * that is rolled back, so the rows survive for the next attempt. The
 * trigger catalogue must name exactly the tables of APPEND_ONLY, so a table
 * that loses its trigger, or a new append-only table missing from the list,
 * fails here.
 */

// docs/04 §2.12: each append-only table, with a timestamp column an UPDATE moves.
const APPEND_ONLY: Record<string, string> = {
  audit_logs: 'occurred_at',
  ledger_entries: 'created_at',
  inventory_movements: 'created_at',
  order_events: 'created_at',
  shipment_events: 'created_at',
  shop_review_decisions: 'created_at',
  product_review_decisions: 'created_at',
  shop_agreements: 'accepted_at',
  support_case_messages: 'created_at',
}
const TABLES = Object.keys(APPEND_ONLY)

const APP = 'pg'
type PgError = { code?: string; message: string }

/*
 * Runs one statement as `connection` in a transaction that is always rolled
 * back, optionally inside a retention batch, and returns `ok:<rows>` or the
 * SQLSTATE. Table and column names go in as `??` identifier bindings.
 */
async function attempt(connection: string, sql: string, bindings: unknown[], purge = false) {
  const trx = await db.connection(connection).transaction()
  try {
    if (purge) await trx.rawQuery(`SET LOCAL dripnepal.retention_purge = 'on'`)
    const result = await trx.rawQuery(sql, bindings)
    return `ok:${result.rowCount}`
  } catch (error) {
    return (error as PgError).code ?? (error as PgError).message
  } finally {
    await trx.rollback()
  }
}

const update = (table: string, id: string, connection: string, purge = false) =>
  attempt(
    connection,
    `UPDATE ?? SET ?? = ?? + interval '1 second' WHERE id = ?`,
    [table, APPEND_ONLY[table], APPEND_ONLY[table], id],
    purge
  )
const remove = (table: string, id: string, connection: string, purge = false) =>
  attempt(connection, 'DELETE FROM ?? WHERE id = ?', [table, id], purge)
// CASCADE, so a table another table references reaches its trigger instead of the FK check
const truncate = (table: string, connection: string, purge = false) =>
  attempt(connection, 'TRUNCATE ?? CASCADE', [table], purge)

/*
 * One committed row in each append-only table, inserted as `dripnepal_app`,
 * which keeps INSERT. Returns the row id per table.
 */
async function appendOnlyRows(): Promise<Record<string, string>> {
  const userId = await insertUser()
  const shopId = await insertShop()
  const { productId, variantId } = await insertVariant(shopId)
  await insertInventoryItem(shopId, variantId)
  const order = await insertOrder()
  const shopOrder = await insertShopOrder(shopId)
  const [shipment] = await db
    .table('shipments')
    .insert({ shop_order_id: shopOrder.id, shop_id: shopId })
    .returning('id')
  const [supportCase] = await db
    .table('support_cases')
    .insert({
      number: `SC-${orderNumber().slice(3)}`,
      category: 'other',
      subject: 'Other',
      due_at: db.raw(`now() + interval '15 days'`),
    })
    .returning('id')

  const rows: Record<string, Record<string, unknown>> = {
    audit_logs: {
      actor_type: 'system',
      action: 'shop.suspend',
      subject_type: 'shop',
      subject_id: shopId,
    },
    ledger_entries: {
      shop_id: shopId,
      entry_type: 'adjustment',
      amount_minor: 10000,
      available_at: db.raw('now()'),
      description: 'Correction agreed with the vendor by phone',
      created_by: userId,
      dedupe_key: `adjustment:${shopId}`,
    },
    inventory_movements: {
      shop_id: shopId,
      variant_id: variantId,
      kind: 'adjustment',
      on_hand_delta: 1,
      reserved_delta: 0,
      reason_code: 'received_stock',
      reference_type: 'request',
      reference_id: shopId,
    },
    order_events: {
      order_id: order.id,
      type: 'order.placed',
      visibility: 'internal',
      actor_type: 'system',
    },
    shipment_events: {
      shipment_id: shipment.id,
      shop_id: shopId,
      event: 'packed',
      status: 'packed',
      actor_type: 'system',
    },
    shop_review_decisions: { shop_id: shopId, decision: 'approved', decided_by: userId },
    product_review_decisions: {
      product_id: productId,
      shop_id: shopId,
      decision: 'approved',
      decided_by: userId,
    },
    shop_agreements: {
      shop_id: shopId,
      agreement_version: '2026-11-01',
      accepted_by_user_id: userId,
      ip_hash: Buffer.alloc(32, 7),
      request_id: 'req-12345678',
    },
    support_case_messages: {
      case_id: supportCase.id,
      author_type: 'system',
      visibility: 'internal',
      body: 'We have registered your complaint.',
    },
  }
  const ids: Record<string, string> = {}
  for (const table of TABLES) {
    const [row] = await db.table(table).insert(rows[table]).returning('id')
    ids[table] = String(row.id)
  }
  return ids
}

test.group('T-ARCH-012 append-only tables', (group) => {
  let ids: Record<string, string> = {}
  group.setup(async () => {
    ids = await appendOnlyRows()
  })

  test('T-ARCH-012 exactly the tables of docs/04 §2.12 carry both forbid_mutation() triggers', async ({
    assert,
  }) => {
    const { rows } = await db.rawQuery(`
      SELECT c.relname AS table, t.tgname AS trigger,
             (t.tgtype & 1) = 1 AS for_each_row, (t.tgtype & 2) = 2 AS before,
             (t.tgtype & 16) = 16 AS on_update, (t.tgtype & 8) = 8 AS on_delete,
             (t.tgtype & 32) = 32 AS on_truncate, (t.tgtype & 4) = 4 AS on_insert, t.tgenabled AS enabled
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE n.nspname = 'public' AND p.proname = 'forbid_mutation' AND NOT t.tgisinternal
       ORDER BY 1, 2
    `)
    type Trigger = {
      table: string
      trigger: string
      for_each_row: boolean
      before: boolean
      on_update: boolean
      on_delete: boolean
      on_truncate: boolean
      on_insert: boolean
      enabled: string
    }
    const triggers = rows as Trigger[]
    assert.sameMembers([...new Set(triggers.map((t) => t.table))], TABLES)
    for (const table of TABLES) {
      const own = triggers.filter((t) => t.table === table)
      assert.sameMembers(
        own.map((t) => t.trigger),
        [`${table}_no_update_delete`, `${table}_no_truncate`],
        table
      )
      const row = own.find((t) => t.trigger === `${table}_no_update_delete`)!
      assert.deepInclude(
        row,
        {
          for_each_row: true,
          before: true,
          on_update: true,
          on_delete: true,
          on_truncate: false,
          on_insert: false,
          enabled: 'O',
        },
        row.trigger
      )
      const statement = own.find((t) => t.trigger === `${table}_no_truncate`)!
      assert.deepInclude(
        statement,
        { for_each_row: false, before: true, on_truncate: true, on_update: false, enabled: 'O' },
        statement.trigger
      )
    }
  })

  test('T-ARCH-012 dripnepal_app is refused UPDATE, DELETE and TRUNCATE by privilege (42501)', async ({
    assert,
  }) => {
    for (const table of TABLES) {
      for (const purge of [false, true]) {
        const when = `${table}${purge ? ', retention_purge on' : ''}`
        assert.equal(await update(table, ids[table], APP, purge), '42501', `UPDATE ${when}`)
        assert.equal(await remove(table, ids[table], APP, purge), '42501', `DELETE ${when}`)
        assert.equal(await truncate(table, APP, purge), '42501', `TRUNCATE ${when}`)
      }
    }
    const redaction = await attempt(
      APP,
      `UPDATE support_case_messages SET body = 'Redacted' WHERE id = ?`,
      [ids.support_case_messages],
      true
    )
    assert.equal(redaction, '42501', 'body redaction with retention_purge on')
  })

  test('T-ARCH-012 the migrator, which owns the tables, is refused by the trigger (P0001)', async ({
    assert,
  }) => {
    for (const table of TABLES) {
      assert.equal(await update(table, ids[table], MIGRATOR_CONNECTION), 'P0001', `UPDATE ${table}`)
      assert.equal(await remove(table, ids[table], MIGRATOR_CONNECTION), 'P0001', `DELETE ${table}`)
      assert.equal(await truncate(table, MIGRATOR_CONNECTION), 'P0001', `TRUNCATE ${table}`)
    }
    const redaction = await attempt(
      MIGRATOR_CONNECTION,
      `UPDATE support_case_messages SET body = 'Redacted' WHERE id = ?`,
      [ids.support_case_messages]
    )
    assert.equal(redaction, 'P0001', 'body redaction without retention_purge')
  })

  test('T-ARCH-012 retention exemption: with retention_purge on the migrator may only DELETE rows and redact case message bodies', async ({
    assert,
  }) => {
    for (const table of TABLES) {
      const label = `${table}, retention_purge on`
      assert.equal(
        await remove(table, ids[table], MIGRATOR_CONNECTION, true),
        'ok:1',
        `DELETE ${label}`
      )
      assert.equal(
        await update(table, ids[table], MIGRATOR_CONNECTION, true),
        'P0001',
        `UPDATE ${label}`
      )
      assert.equal(await truncate(table, MIGRATOR_CONNECTION, true), 'P0001', `TRUNCATE ${label}`)
    }
    const redact = (sql: string) =>
      attempt(MIGRATOR_CONNECTION, sql, [ids.support_case_messages], true)
    assert.equal(
      await redact(`UPDATE support_case_messages SET body = 'Redacted' WHERE id = ?`),
      'ok:1',
      'body alone'
    )
    assert.equal(
      await redact(
        `UPDATE support_case_messages SET body = 'Redacted', visibility = 'customer' WHERE id = ?`
      ),
      'P0001',
      'body and another column'
    )
    // Nothing above committed: every row is still there, unchanged
    for (const table of TABLES) {
      const row = await db.from(table).where('id', ids[table]).first()
      assert.isNotNull(row, table)
    }
    const message = await db
      .from('support_case_messages')
      .where('id', ids.support_case_messages)
      .first()
    assert.equal(message.body, 'We have registered your complaint.')
  })

  test('T-ARCH-012 dripnepal_app has no UPDATE or TRUNCATE on payout_entries (docs/04a §13.3)', async ({
    assert,
  }) => {
    assert.equal(
      await attempt(APP, 'UPDATE payout_entries SET created_at = created_at', []),
      '42501',
      'UPDATE'
    )
    assert.equal(await attempt(APP, 'TRUNCATE payout_entries', []), '42501', 'TRUNCATE')
    // Links are still inserted, and deleted while the payout is a draft
    const { rows } = await db.rawQuery(`
      SELECT has_table_privilege('payout_entries', 'INSERT') AS can_insert,
             has_table_privilege('payout_entries', 'DELETE') AS can_delete
    `)
    assert.deepEqual(rows[0], { can_insert: true, can_delete: true })
  })
})
