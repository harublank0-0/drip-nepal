import factory from '@adonisjs/lucid/factories'
import User from '#models/user'
import { DateTime } from 'luxon'
import { random } from '#utils/random'

export const UserFactory = factory
  .define(User, async ({ faker }) => {
    return {
      fullName: faker.person.fullName(),
      username: faker.internet.username({
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
      }),
      email: faker.internet.email(),
      password: random(0, 1) ? 'dripnepal' : null,
      phone: random(0, 1) ? faker.phone.number({ style: 'international' }) : null,
      avatar: random(0, 1) ? faker.image.avatar() : null,
      status: faker.helpers.arrayElement([
        'active',
        'suspended',
        'deleted',
        'pending_verification',
      ]),
      emailVerifiedAt: random(0, 1) ? DateTime.fromISO(faker.date.past().toISOString()) : null,
      lastLoginAt: random(0, 1) ? DateTime.fromISO(faker.date.past().toISOString()) : null,
      deletedAt: random(0, 1) ? DateTime.fromISO(faker.date.past().toISOString()) : null,
      createdAt: DateTime.fromISO(faker.date.past().toISOString()),
      updatedAt: random(0, 1)
        ? DateTime.fromISO(faker.date.past().toISOString())
        : DateTime.fromISO(faker.date.past().toISOString()),
    }
  })
  .build()
