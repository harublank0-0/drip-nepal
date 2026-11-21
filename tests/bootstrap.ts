import { assert } from '@japa/assert'
import app from '@adonisjs/core/services/app'
import type { Config } from '@japa/runner/types'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import { dbAssertions } from '@adonisjs/lucid/plugins/db'
import testUtils from '@adonisjs/core/services/test_utils'
import { browserClient } from '@japa/browser-client'
import { authBrowserClient } from '@adonisjs/auth/plugins/browser_client'
import { sessionBrowserClient } from '@adonisjs/session/plugins/browser_client'
import { prepareTestDatabase } from '#tests/support/database'
import { stopJobBoss } from '#tests/support/jobs'

/**
 * This file is imported by the "bin/test.ts" entrypoint file
 */

/**
 * Configure Japa plugins in the plugins array.
 * Learn more - https://japa.dev/docs/runner-config#plugins-optional
 */
export const plugins: Config['plugins'] = [
  assert(),
  pluginAdonisJS(app),
  dbAssertions(app),
  browserClient({ runInSuites: ['browser'] }),
  sessionBrowserClient(app),
  authBrowserClient(app),
]

/**
 * Configure lifecycle function to run before and after all the
 * tests.
 *
 * The setup functions are executed before all the tests
 * The teardown functions are executed after all the tests
 */
export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  setup: [],
  // A test that started the shared pg-boss instance leaves its pool open: close it (tests/support/jobs.ts).
  teardown: [() => stopJobBoss()],
}

/**
 * Configure suites by tapping into the test suite instance.
 * Learn more - https://japa.dev/docs/test-suites#lifecycle-hooks
 *
 * Suites that touch the database rebuild it once per run (docs/10 §3.2).
 * Functional tests each run inside a global transaction that is rolled
 * back afterwards; the service transactions become savepoints of it. The
 * concurrency suite commits for real on separate connections, because a
 * global transaction would serialise its parallel calls on one connection
 * and hide the races it exists to find (docs/10 §3.3).
 */
export const configureSuite: Config['configureSuite'] = (suite) => {
  if (['functional', 'concurrency', 'browser'].includes(suite.name)) {
    suite.setup(() => prepareTestDatabase())
  }

  if (suite.name === 'functional') {
    const wrap = () => testUtils.db().wrapInGlobalTransaction()
    suite.onGroup((group) => group.each.setup(wrap))
    suite.onTest((t) => t.setup(wrap))
  }

  if (['browser', 'functional', 'concurrency', 'e2e'].includes(suite.name)) {
    return suite.setup(() => testUtils.httpServer().start())
  }
}
