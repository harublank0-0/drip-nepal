import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'product_media'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.uuid('product_id').notNullable().index()
      table.foreign('product_id').references('products.id').onDelete('CASCADE')

      table.uuid('variant_id').nullable().index()
      table.foreign('variant_id').references('product_variants.id').onDelete('CASCADE')

      table
        .string('type', 50)
        .notNullable()
        .comment('image / video / instagram_reel / tiktok_video')

      table.string('provider', 50).nullable().comment('internal / instagram / tiktok / cloudinary')

      table.string('url', 255).notNullable()

      table.string('thumbnail_url', 255).nullable()

      table.string('alt_text', 100).nullable()

      table.jsonb('metadata').nullable()

      table.string('sort_order').nullable()

      table.timestamp('created_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
