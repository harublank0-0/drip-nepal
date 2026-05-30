import { ShopStaffRoleSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import Shop from './shop.ts'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ShopRole from './shop_role.ts'
import User from './user.ts'

export default class ShopStaffRole extends ShopStaffRoleSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => ShopRole)
  declare role: BelongsTo<typeof ShopRole>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
