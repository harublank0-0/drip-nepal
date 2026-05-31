import { Categories } from '#constants/categories'
import Category from '#models/category'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder {
  async run() {
    await Category.updateOrCreateMany('slug', [...Categories])
  }
}
