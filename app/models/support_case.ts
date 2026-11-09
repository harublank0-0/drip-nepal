import { SupportCaseSchema } from '#database/schema'
import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import SupportCaseMessage from './support_case_message.js'

/*
 * docs/04a §14.1 (platform). `platform` imports no other module
 * (docs/09 §2.2), so the users, order, shop order, shop and assignee keys
 * have no relations here; `ReturnRequest` (orders) relates down to a case.
 */
export default class SupportCase extends SupportCaseSchema {
  // docs/04a §14.2: the written thread
  @hasMany(() => SupportCaseMessage, { foreignKey: 'caseId' })
  declare messages: HasMany<typeof SupportCaseMessage>
}
