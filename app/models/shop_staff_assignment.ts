import { belongsTo } from '@adonisjs/lucid/orm'
import Shop from './shop.ts'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ShopRole from './shop_role.ts'
import User from './user.ts'
import { ShopStaffAssignmentSchema } from '#database/schema'

export default class ShopStaffAssignment extends ShopStaffAssignmentSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => ShopRole)
  declare role: BelongsTo<typeof ShopRole>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
