import env from '#start/env'
import { defineConfig } from '@adonisjs/session'
import { runtime } from '#config/runtime'
import { taggedExpiryStore } from '#modules/platform/session_store'

/*
 * Sessions (ADR-0005, docs/07 §3.1). The database store keeps every session
 * server-side, so a suspension, a password change or "log out everywhere"
 * can end it (RF-04); there is no cookie store. `memory` remains for local
 * experiments only: staging and production require `database`
 * (start/env_policy.ts), and the tests use `database` too.
 */
const sessionConfig = defineConfig({
  enabled: true,

  cookieName: 'dripnepal_session',

  // The cookie outlives a browser restart; the server-side expiry ends the session.
  clearWithBrowser: false,

  /*
   * The idle expiry of a signed-in session: 7 days, the longest idle period
   * any user may have [Assumption A-23]. The cookie's Max-Age is the same.
   * A session without a signed-in user expires after 2 h (the store below);
   * the seller, admin and absolute limits are checked by middleware
   * (docs/07 §3.4).
   */
  age: '7d',

  cookie: {
    path: '/',
    httpOnly: true,
    // Staging and production are served over HTTPS (docs/07 §3.1). No
    // `domain`: the cookie is host-only.
    secure: runtime.appEnv === 'staging' || runtime.appEnv === 'production',
    sameSite: 'lax',
  },

  store: env.get('SESSION_DRIVER'),

  stores: {
    database: taggedExpiryStore({ anonymousAge: '2h' }),
  },
})

export default sessionConfig
