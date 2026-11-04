import { GlobalRoleSchema } from '#database/schema'
import { manyToMany } from '@adonisjs/lucid/orm'
import Permission from './permission.js'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import User from './user.js'

export default class GlobalRole extends GlobalRoleSchema {
  @manyToMany(() => User, {
    pivotTable: 'global_user_roles',
    pivotForeignKey: 'global_role_id',
    pivotRelatedForeignKey: 'user_id',
  })
  declare users: ManyToMany<typeof User>

  @manyToMany(() => Permission, {
    pivotTable: 'global_role_permissions',
    pivotForeignKey: 'global_role_id',
    pivotRelatedForeignKey: 'permission_id',
    pivotTimestamps: true,
  })
  declare permissions: ManyToMany<typeof Permission>
}
