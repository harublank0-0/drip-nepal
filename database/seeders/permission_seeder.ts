import { ProductPermissionValues } from '#constants/permissions/product_permissions'
import Permission from '#models/permission'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder {
  async run() {
    await Permission.updateOrCreateMany('slug', ProductPermissionValues)
  }
}
