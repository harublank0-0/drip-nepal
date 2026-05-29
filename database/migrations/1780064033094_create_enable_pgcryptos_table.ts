import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'enable_pgcryptos'

  async up() {
    this.schema.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto";')
  }

  async down() {
    this.schema.raw('DROP EXTENSION IF EXISTS "pgcrypto";')
  }
}
