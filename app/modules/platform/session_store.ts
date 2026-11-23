import { configProvider } from '@adonisjs/core'
import string from '@adonisjs/core/helpers/string'
import { MessageBuilder } from '@adonisjs/core/helpers'
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
 * expiries instead of the package's one `age`, both chosen by the row's tag
 * (`user_id`):
 *
 * - `write()` and `touch()` extend a tagged row by the configured `age`,
 *   7 days, the longest idle period any user may have, and any other row by
 *   `anonymousAge`, 2 h. A session is tagged right after sign-in, so a
 *   guest's row (mostly a CSRF secret from crawlers and probes) is short-
 *   lived, and a signed-in session that lost its tag to the revocation race
 *   of docs/07 §3.3 idles out after 2 h whether it is written or touched.
 * - `write()` is one upsert that reads the tag in the same statement; the
 *   package's own `write()` cannot, since it merges only `data` and
 *   `expires_at`. It collects garbage as the package does.
 * - read, destroy, tag, untag and tagged are the package's.
 *
 * Verified against the installed package source (build/database-*.js and
 * session-*.js): the store contract is read, write, destroy and touch, plus
 * tag, untag and tagged for tagging; `Session.commit()` calls `write()`
 * when the data changed or the ID was regenerated and `touch()` otherwise,
 * `destroy()` when the data is empty, and `tag()` upserts the row at once,
 * merging only `user_id`, so a later `write()` keeps the tag; the data is a
 * `MessageBuilder` message with the session ID as its purpose.
 */

// The package's default chance, in percent, of deleting expired rows after a write.
const GC_PROBABILITY = 2

export type TaggedExpiryStoreConfig = {
  // The expiry of a session without a signed-in user (docs/07 §3.1) [Assumption].
  anonymousAge: string
  tableName?: string
  connectionName?: string
}

export class TaggedExpiryStore implements SessionStoreWithTaggingContract {
  #store: SessionStoreWithTaggingContract
  #client: QueryClientContract
  #tableName: string
  #ageSeconds: number
  #anonymousAgeSeconds: number

  constructor(options: {
    store: SessionStoreWithTaggingContract
    client: QueryClientContract
    tableName: string
    age: string | number
    anonymousAge: string | number
  }) {
    this.#store = options.store
    this.#client = options.client
    this.#tableName = options.tableName
    this.#ageSeconds = string.seconds.parse(options.age)
    this.#anonymousAgeSeconds = string.seconds.parse(options.anonymousAge)
  }

  // The two expiries from now: [untagged, tagged].
  #expiries() {
    const now = Date.now()
    return [
      new Date(now + this.#anonymousAgeSeconds * 1000),
      new Date(now + this.#ageSeconds * 1000),
    ]
  }

  read(sessionId: string) {
    return this.#store.read(sessionId)
  }

  async write(sessionId: string, values: SessionData) {
    const data = new MessageBuilder().build(values, undefined, sessionId)
    const [anonymous, signedIn] = this.#expiries()
    await this.#client.rawQuery(
      `INSERT INTO ?? (id, data, expires_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data,
         expires_at = CASE WHEN ??.user_id IS NULL THEN ?::timestamptz ELSE ?::timestamptz END`,
      [this.#tableName, sessionId, data, anonymous, this.#tableName, anonymous, signedIn]
    )
    if (Math.random() * 100 < GC_PROBABILITY) {
      await this.#client.from(this.#tableName).where('expires_at', '<=', new Date()).delete()
    }
  }

  destroy(sessionId: string) {
    return this.#store.destroy(sessionId)
  }

  async touch(sessionId: string) {
    const [anonymous, signedIn] = this.#expiries()
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
    return this.#store.tag(sessionId, userId)
  }

  untag(sessionId: string, userId: string | number) {
    return this.#store.untag(sessionId, userId)
  }

  tagged(userId: string | number) {
    return this.#store.tagged(String(userId))
  }
}

/*
 * The live sessions tagged with `userId`, for `identity.revoke_sessions`
 * (docs/07 §3.3): each row's ID, its stored `data` as read (`raw`, which the
 * job's delete compares, so a row written since the read survives), and
 * that data decoded and verified with the session ID as its purpose, as the
 * package's `tagged()` does. Unlike `tagged()`, a row whose data does not
 * verify is returned too, with `data` null: a revocation deletes it rather
 * than skip it. It reads through `client`, so the job reads and deletes in
 * its own transaction; the container's `SessionCollection` cannot, being a
 * singleton whose store keeps the connection it resolved first.
 */
export type TaggedSessionRow = { id: string; raw: string; data: SessionData | null }

export async function taggedSessions(
  client: QueryClientContract,
  userId: string,
  tableName = 'sessions'
): Promise<TaggedSessionRow[]> {
  const rows: { id: string; data: string }[] = await client
    .from(tableName)
    .where('user_id', userId)
    .where('expires_at', '>', new Date())
    .select('id', 'data')
  return rows.map((row) => {
    let data: SessionData | null = null
    try {
      data = new MessageBuilder().verify<SessionData>(row.data, row.id)
    } catch {
      data = null
    }
    return { id: row.id, raw: row.data, data }
  })
}

/*
 * The store for `config/session.ts`. The package's database store is not
 * exported, so its factory is resolved from `stores.database()` and called
 * once per request; `write()` and `touch()` are this class's own.
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
        store: databaseStore(ctx, sessionConfig) as SessionStoreWithTaggingContract,
        // Per request, as the package does, so a functional test's global
        // transaction is used when one is open.
        client: db.connection(connectionName),
        tableName,
        age: sessionConfig.age,
        anonymousAge: config.anonymousAge,
      })
  })
}
