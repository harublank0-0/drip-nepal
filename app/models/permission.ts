import { PermissionSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ShopRole from './shop_role.js'
import GlobalRole from './global_role.js'

export default class Permission extends PermissionSchema {
  @belongsTo(() => GlobalRole)
  declare role: BelongsTo<typeof GlobalRole>

  @belongsTo(() => ShopRole)
  declare shopRole: BelongsTo<typeof ShopRole>
}
