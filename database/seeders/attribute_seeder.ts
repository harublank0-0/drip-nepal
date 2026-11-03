import { VariantAttributes } from '#constants/product'
import Attribute from '#models/attribute'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder {
  async run() {
    await Attribute.updateOrCreateMany('slug', Object.values(VariantAttributes))
  }
}
