import { configProvider } from '@adonisjs/core'
import string from '@adonisjs/core/helpers/string'
import { stores } from '@adonisjs/session'
import type { ConfigProvider } from '@adonisjs/core/types'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import type {
  SessionData,
  SessionStoreFactory,
  SessionStoreWithTaggingContract,
} from '@adonisjs/session/types'

/*
 * The session store of docs/07 §3.1 and docs/04a §5.3: a thin wrapper over
 * `stores.database()` of @adonisjs/session 8.1.0 that gives a session two
 * expiries instead of the package's one `age`.
 *
 * - A signed-in session (data holding the guard key `auth_web`) is written
 *   with the configured `age`, 7 days, the longest idle period any user may
 *   have. Anything else, which is mostly a guest's CSRF secret, is written
 *   with `anonymousAge`, 2 h, so crawlers and probes leave short-lived rows.
 * - `touch()`, which the session runs instead of `write()` when a request
 *   leaves the data unchanged, extends a tagged row (`user_id` set) by the
 *   `age` and an untagged one by `anonymousAge`. A signed-in session that
 *   lost its tag to the revocation race of docs/07 §3.3 therefore idles out
 *   after 2 h.
 *
 * Verified against the installed package source (build/database-*.js and
 * session-*.js): the store contract is read, write, destroy and touch, plus
 * tag, untag and tagged for tagging; `Session.commit()` calls `write()`
 * when the data changed or the ID was regenerated and `touch()` otherwise,
 * `destroy()` when the data is empty, and `tag()` upserts the row at once,
 * merging only `user_id`, so a later `write()` keeps the tag.
 */

// The session key of the `web` session guard (config/auth.ts): `auth_<guard>`.
export const SIGNED_IN_KEY = 'auth_web'

export type TaggedExpiryStoreConfig = {
  // The expiry of a session without a signed-in user (docs/07 §3.1) [Assumption].
  anonymousAge: string
  tableName?: string
  connectionName?: string
}

export class TaggedExpiryStore implements SessionStoreWithTaggingContract {
  #signedIn: SessionStoreWithTaggingContract
  #anonymous: SessionStoreWithTaggingContract
  #client: QueryClientContract
  #tableName: string
  #ageSeconds: number
  #anonymousAgeSeconds: number

  constructor(options: {
    signedIn: SessionStoreWithTaggingContract
    anonymous: SessionStoreWithTaggingContract
    client: QueryClientContract
    tableName: string
    age: string | number
    anonymousAge: string | number
  }) {
    this.#signedIn = options.signedIn
    this.#anonymous = options.anonymous
    this.#client = options.client
    this.#tableName = options.tableName
    this.#ageSeconds = string.seconds.parse(options.age)
    this.#anonymousAgeSeconds = string.seconds.parse(options.anonymousAge)
  }

  read(sessionId: string) {
    return this.#signedIn.read(sessionId)
  }

  write(sessionId: string, values: SessionData) {
    const store = Object.hasOwn(values, SIGNED_IN_KEY) ? this.#signedIn : this.#anonymous
    return store.write(sessionId, values)
  }

  destroy(sessionId: string) {
    return this.#signedIn.destroy(sessionId)
  }

  async touch(sessionId: string) {
    const now = Date.now()
    const signedIn = new Date(now + this.#ageSeconds * 1000)
    const anonymous = new Date(now + this.#anonymousAgeSeconds * 1000)
    await this.#client
      .from(this.#tableName)
      .where('id', sessionId)
      .update({
        expires_at: this.#client.raw(
          'CASE WHEN user_id IS NULL THEN ?::timestamptz ELSE ?::timestamptz END',
          [anonymous, signedIn]
        ),
      })
  }

  // Tagging follows sign-in, so a row it has to create gets the signed-in age.
  tag(sessionId: string, userId: string | number) {
    return this.#signedIn.tag(sessionId, userId)
  }

  untag(sessionId: string, userId: string | number) {
    return this.#signedIn.untag(sessionId, userId)
  }

  tagged(userId: string | number) {
    return this.#signedIn.tagged(String(userId))
  }
}

/*
 * The store for `config/session.ts`. The package's database store is not
 * exported, so its factory is resolved from `stores.database()` and called
 * twice per request, once with each age.
 */
export function taggedExpiryStore(
  config: TaggedExpiryStoreConfig
): ConfigProvider<SessionStoreFactory> {
  return configProvider.create(async (app) => {
    const tableName = config.tableName ?? 'sessions'
    const databaseStore = await stores
      .database({ tableName, connectionName: config.connectionName })
      .resolver(app)
    const db = await app.container.make('lucid.db')
    const connectionName = config.connectionName ?? db.primaryConnectionName

    return (ctx, sessionConfig) =>
      new TaggedExpiryStore({
        signedIn: databaseStore(ctx, sessionConfig) as SessionStoreWithTaggingContract,
        anonymous: databaseStore(ctx, {
          ...sessionConfig,
          age: config.anonymousAge,
        }) as SessionStoreWithTaggingContract,
        // Per request, as the package does, so a functional test's global
        // transaction is used when one is open.
        client: db.connection(connectionName),
        tableName,
        age: sessionConfig.age,
        anonymousAge: config.anonymousAge,
      })
  })
}
