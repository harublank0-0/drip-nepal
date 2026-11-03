import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * A recipient phone was unique across every address of every user, so two
 * addresses could never share a number. It is a contact number, not an id.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('user_addresses', (table) => {
      table.dropUnique(['recipient_phone'])
    })
  }

  async down() {
    this.schema.alterTable('user_addresses', (table) => {
      table.unique(['recipient_phone'])
    })
  }
}
