import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Money as whole paisa (RF-16, ADR-0007, docs/04 §18.1): every amount was
 * decimal(10,2) rupees, which the code added as JavaScript floats and which
 * stopped at Rs 9,99,99,999.99. Each becomes `<name>_minor bigint` in paisa,
 * never negative. Existing values convert exactly: a decimal(10,2) times
 * 100 is a whole number.
 *
 * The M0 schema re-baseline (ADR-0011) replaces these tables, adding the
 * `currency` columns and the other checks of docs/04 §16.3.
 */
const MONEY_COLUMNS: { table: string; column: string; nullable?: boolean }[] = [
  { table: 'product_variants', column: 'price' },
  { table: 'product_variants', column: 'compare_price', nullable: true },
  { table: 'orders', column: 'subtotal' },
  { table: 'orders', column: 'discount_total' },
  { table: 'orders', column: 'shipping_total' },
  { table: 'orders', column: 'grand_total' },
  { table: 'order_items', column: 'unit_price' },
  { table: 'order_items', column: 'sub_total' },
  { table: 'payments', column: 'amount' },
]

export default class extends BaseSchema {
  async up() {
    for (const { table, column, nullable } of MONEY_COLUMNS) {
      const minor = `${column}_minor`
      this.schema.raw(
        `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE bigint USING round(${column} * 100)::bigint`
      )
      this.schema.raw(`ALTER TABLE ${table} RENAME COLUMN ${column} TO ${minor}`)
      this.schema.raw(
        `ALTER TABLE ${table} ADD CONSTRAINT ${table}_${minor}_check CHECK (${
          nullable ? `${minor} IS NULL OR ` : ''
        }${minor} >= 0)`
      )
    }
  }

  async down() {
    for (const { table, column } of MONEY_COLUMNS) {
      const minor = `${column}_minor`
      this.schema.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_${minor}_check`)
      this.schema.raw(`ALTER TABLE ${table} RENAME COLUMN ${minor} TO ${column}`)
      // Fails for an amount beyond decimal(10,2), which paisa can hold.
      this.schema.raw(
        `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE decimal(10,2) USING ${column} / 100.0`
      )
    }
  }
}
