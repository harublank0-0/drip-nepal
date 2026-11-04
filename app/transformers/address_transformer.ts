import type UserAddress from '#models/user_address'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class AddressTransformer extends BaseTransformer<UserAddress> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'label',
      'recipientName',
      'recipientPhone',
      'province',
      'district',
      'municipality',
      'city',
      'area',
      'streetAddress',
      'isDefault',
    ])
  }
}
