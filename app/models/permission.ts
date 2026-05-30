import { PermissionSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import Role from './role.ts'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ShopRole from './shop_role.ts'

export default class Permission extends PermissionSchema {
  @belongsTo(() => Role)
  declare role: BelongsTo<typeof Role>

  @belongsTo(() => ShopRole)
  declare shopRole: BelongsTo<typeof ShopRole>
}
