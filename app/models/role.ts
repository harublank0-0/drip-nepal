import { RoleSchema } from '#database/schema'
import { manyToMany } from '@adonisjs/lucid/orm'
import Permission from './permission.ts'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import User from './user.ts'

export default class Role extends RoleSchema {
  @manyToMany(() => User, {
    pivotTable: 'user_roles',
  })
  declare users: ManyToMany<typeof User>

  @manyToMany(() => Permission)
  declare permissions: ManyToMany<typeof Permission>
}
