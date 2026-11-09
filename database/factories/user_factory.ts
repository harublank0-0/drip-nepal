import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import factory from '@adonisjs/lucid/factories'
import User from '#models/user'
import type { UserStatus } from '#modules/identity/domain/user_status'

/*
 * Users (docs/04a §5.1) for tests and development seeders (docs/04 §20.3,
 * docs/09 §8.8). The default is the happy path: an `active` user with a
 * verified e-mail (`users_active_verified_check`). Every user gets a
 * password hash (`users_identity_required_check`): one random password per
 * run, hashed by the model's `withAuthFinder` hook, never a literal
 * (docs/09 §9.2). Phone columns stay null until the E6 `fieldCrypto`
 * service and blind-index key exist (see placeholder_ciphertext.ts).
 *
 * States, one per non-default status a factory can reach without an
 * action: `pending_verification`, `suspended`, `deactivated`.
 * `anonymized` is left to the anonymisation action (docs/04 §19.2).
 */

/** The plaintext password of every factory user in this run. */
export const FACTORY_PASSWORD = randomBytes(18).toString('base64url')

let sequence = 0

const status = (value: UserStatus) => value

export const UserFactory = factory
  .define(User, ({ faker }) => {
    sequence += 1
    const local = faker.string.alphanumeric({ length: 8, casing: 'lower' })
    return {
      email: `user-${sequence}-${local}@example.com`,
      fullName: faker.person.fullName(),
      passwordHash: FACTORY_PASSWORD,
      status: status('active'),
      emailVerifiedAt: DateTime.now(),
    }
  })
  .state('pending_verification', (user) => {
    user.status = status('pending_verification')
    user.emailVerifiedAt = null
  })
  .state('suspended', (user) => {
    user.status = status('suspended')
  })
  .state('deactivated', (user) => {
    user.status = status('deactivated')
    user.deletionRequestedAt = DateTime.now()
  })
  .build()
