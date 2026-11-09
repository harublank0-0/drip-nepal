import { UserTokenSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'

/* docs/04a §5.2 (identity) */
export default class UserToken extends UserTokenSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
