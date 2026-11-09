import { DeliveryZoneSchema } from '#database/schema'
import { manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import District from './district.js'

/*
 * docs/04a §9.4 (logistics). `delivery_zone_districts` (§9.5) has a
 * composite key, so it has no model of its own: it is read through this
 * relation and written only with the query builder (docs/04 §2.15).
 */
export default class DeliveryZone extends DeliveryZoneSchema {
  @manyToMany(() => District, {
    pivotTable: 'delivery_zone_districts',
    localKey: 'code',
    pivotForeignKey: 'zone_code',
    relatedKey: 'code',
    pivotRelatedForeignKey: 'district_code',
    pivotTimestamps: { createdAt: 'created_at', updatedAt: false },
  })
  declare districts: ManyToMany<typeof District>
}
