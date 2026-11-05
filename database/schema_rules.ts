import { type SchemaRules } from '@adonisjs/lucid/types/schema_generator'

/*
 * `bigint` columns (money in paisa) are numbers: start/database_types.ts
 * parses int8 into a safe number (docs/04 §18.4).
 */
export default {
  types: {
    bigint: { tsType: 'number', decorators: [{ name: '@column' }] },
  },
} satisfies SchemaRules
