import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Validates the `platform_settings_value_check` that the previous file added
 * NOT VALID with the key `platform_account_cod_enabled` (docs/09 §8.5,
 * docs/04 §20.2.4: a NOT VALID constraint and its VALIDATE are never in the
 * same file). VALIDATE scans without blocking writes.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)
    this.schema.raw(
      String.raw`ALTER TABLE platform_settings VALIDATE CONSTRAINT platform_settings_value_check`
    )
  }

  async down() {
    // A validated constraint cannot be made NOT VALID again; the previous file's down replaces it.
  }
}
