import { GlobalRolesValues } from '#constants/global_roles'
import GlobalRole from '#models/global_role'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder {
  async run() {
    await GlobalRole.updateOrCreateMany('slug', GlobalRolesValues)
  }
}
