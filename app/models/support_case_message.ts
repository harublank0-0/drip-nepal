import { SupportCaseMessageSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import SupportCase from './support_case.js'

/*
 * docs/04a §14.2 (platform). Append-only (docs/04 §2.12). `platform` imports
 * no other module (docs/09 §2.2), so `author_user_id` has no relation here.
 */
export default class SupportCaseMessage extends SupportCaseMessageSchema {
  @belongsTo(() => SupportCase, { foreignKey: 'caseId' })
  declare supportCase: BelongsTo<typeof SupportCase>
}
