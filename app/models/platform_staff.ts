import { PlatformStaffSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'

/* docs/04a §5.4 (identity) */
export default class PlatformStaff extends PlatformStaffSchema {
  static table = 'platform_staff'

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'grantedBy' })
  declare grantedByUser: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'revokedBy' })
  declare revokedByUser: BelongsTo<typeof User>
}
