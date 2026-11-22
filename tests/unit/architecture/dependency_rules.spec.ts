import { test } from '@japa/runner'
import { join } from 'node:path'
import { fixtureTree, runCommand } from '#tests/support/scripts'

/*
 * T-ARCH-001 (docs/09 §2.4): the module dependency rules of
 * .dependency-cruiser.cjs, and T-SEC-016, its outbound-HTTP rule 8 (docs/07
 * TM-13). The repository must pass; a fixture tree that breaks each rule
 * once must fail with exactly the expected violations, so a rule whose
 * pattern matches nothing fails here. The model rules read the repository's
 * architecture/model-ownership.json, so the fixtures use its model paths.
 */

const DEPCRUISE = join(process.cwd(), 'node_modules', '.bin', 'depcruise')
const CONFIG = join(process.cwd(), '.dependency-cruiser.cjs')

type Violation = { rule: { name: string }; from: string; to: string }

async function cruise(cwd: string) {
  const result = await runCommand(
    DEPCRUISE,
    ['app', 'start', 'database', '--config', CONFIG, '--output-type', 'json'],
    { cwd }
  )
  if (!result.stdout.startsWith('{')) throw new Error(`depcruise failed: ${result.stderr}`)
  const report = JSON.parse(result.stdout) as { summary: { violations: Violation[] } }
  return report.summary.violations
    .map((violation) => `${violation.rule.name}: ${violation.from} → ${violation.to}`)
    .sort()
}

const BASE = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { module: 'nodenext', moduleResolution: 'nodenext' },
  }),
  'package.json': JSON.stringify({ name: 'fixture', type: 'module' }),
  'node_modules/axios/package.json': JSON.stringify({ name: 'axios', main: 'index.js' }),
  'node_modules/axios/index.js': 'export default {}\n',
  'node_modules/@adonisjs/lucid/package.json': JSON.stringify({ name: '@adonisjs/lucid' }),
  'node_modules/@adonisjs/mail/package.json': JSON.stringify({ name: '@adonisjs/mail' }),
  'node_modules/@adonisjs/mail/services/main.js': 'export default {}\n',
  'node_modules/@adonisjs/lucid/services/db.js': 'export default {}\n',
  'app/modules/platform/money.ts': 'export const zero = 0\n',
  'app/modules/identity/actions/sign_up.ts':
    "import { zero } from '../../platform/money.js'\nexport const signUp = zero\n",
  'app/modules/identity/internal/hash.ts': 'export const hash = 1\n',
  'app/modules/identity/queries.ts': 'export const find = 1\n',
  'app/modules/shops/actions/apply.ts':
    "import { find } from '../../identity/queries.js'\nexport const apply = find\n",
  'app/modules/logistics/providers/ncm.ts':
    "import axios from 'axios'\nimport { request } from 'node:https'\nexport const ncm = [axios, request]\n",
  'start/routes.ts':
    "import { apply } from '../app/modules/shops/actions/apply.js'\nexport const r = apply\n",
  'app/modules/platform/rate_limits.ts':
    "import { isIPv4 } from 'node:net'\nexport const v4 = isIPv4\n",
  'app/models/user.ts': 'export default class User {}\n',
  'app/models/shop.ts':
    "import User from './user.js'\nexport default class Shop { owner = User }\n",
  'app/controllers/shops_controller.ts':
    "import type Shop from '../models/shop.js'\nimport { apply } from '../modules/shops/actions/apply.js'\nexport type S = Shop\nexport const a = apply\n",
  'database/migrations/1794026522050_baseline_things.ts':
    "export const sql = 'CREATE TABLE things ()'\n",
}

// Each file breaks one rule once.
const BROKEN = {
  // rank: platform imports a module above it
  'app/modules/platform/jobs.ts':
    "import { signUp } from '../identity/actions/sign_up.js'\nexport const j = signUp\n",
  // public surface: shops reads identity's internal/ folder
  'app/modules/shops/actions/invite.ts':
    "import { hash } from '../../identity/internal/hash.js'\nexport const i = hash\n",
  // cycle inside a module
  'app/modules/audit/actions/a.ts': "import { b } from './b.js'\nexport const a = () => b\n",
  'app/modules/audit/actions/b.ts': "import { a } from './a.js'\nexport const b = () => a\n",
  // notifications reads another module's actions/, and something imports notifications
  'app/modules/notifications/jobs/dispatch.ts':
    "import { apply } from '../../shops/actions/apply.js'\nexport const d = apply\n",
  'app/modules/orders/queries.ts':
    "import { d } from '../notifications/jobs/dispatch.js'\nexport const q = d\n",
  // model rule: an identity model imports a shops model
  'app/models/user_token.ts':
    "import Shop from './shop.js'\nexport default class UserToken { shop = Shop }\n",
  // controllers: a model as a value, and the db service
  'app/controllers/users_controller.ts':
    "import User from '../models/user.js'\nimport db from '@adonisjs/lucid/services/db'\nexport const u = [User, db]\n",
  // migrations import the application
  'database/migrations/1794026524134_baseline_more.ts':
    "import { zero } from '../../app/modules/platform/money.js'\nexport const z = zero\n",
  // T-SEC-016: an HTTP client and Node network modules outside providers/
  'app/modules/catalog/actions/import_image.ts':
    "import axios from 'axios'\nimport { get } from 'node:https'\nimport { connect } from 'node:net'\nexport const x = [axios, get, connect]\n",
  'start/heartbeat.ts': "import http from 'http'\nexport const h = http\n",
  // T-SEC-016: the mail service outside providers/, which would skip the EmailSender port
  'app/modules/identity/actions/notify.ts':
    "import mail from '@adonisjs/mail/services/main'\nexport const m = mail\n",
  // an import nothing resolves
  'app/modules/cart/actions/add.ts':
    "import { gone } from '../../catalog/queries.js'\nexport const add = gone\n",
}

test.group('T-ARCH-001 module dependency rules (dependency-cruiser)', (group) => {
  group.each.timeout(60_000)

  test('T-ARCH-001 the repository passes', async ({ assert }) => {
    const result = await runCommand(DEPCRUISE, ['app', 'start', 'database', '--config', CONFIG])
    assert.equal(result.code, 0, `${result.stdout}${result.stderr}`)
  })

  test('T-ARCH-001 a tree that follows docs/09 §2.2 passes, adapters and rate_limits included', async ({
    assert,
  }) => {
    const tree = await fixtureTree(BASE)
    try {
      assert.deepEqual(await cruise(tree.root), [])
    } finally {
      await tree.cleanup()
    }
  })

  test('T-ARCH-001 and T-SEC-016 each broken rule is reported', async ({ assert }) => {
    const tree = await fixtureTree({ ...BASE, ...BROKEN })
    try {
      assert.deepEqual(await cruise(tree.root), [
        'controllers-no-db: app/controllers/users_controller.ts → node_modules/@adonisjs/lucid/services/db.js',
        'controllers-no-model-values: app/controllers/users_controller.ts → app/models/user.ts',
        'core-net-in-adapters-only: app/modules/catalog/actions/import_image.ts → net',
        'core-network-in-adapters-only: app/modules/catalog/actions/import_image.ts → https',
        'core-network-in-adapters-only: start/heartbeat.ts → http',
        'migrations-self-contained: database/migrations/1794026524134_baseline_more.ts → app/modules/platform/money.ts',
        'models-identity: app/models/user_token.ts → app/models/shop.ts',
        'no-cycles: app/modules/audit/actions/a.ts → app/modules/audit/actions/b.ts',
        'nobody-imports-notifications: app/modules/orders/queries.ts → app/modules/notifications/jobs/dispatch.ts',
        'not-to-unresolvable: app/modules/cart/actions/add.ts → ../../catalog/queries.js',
        'notifications-read-only: app/modules/notifications/jobs/dispatch.ts → app/modules/shops/actions/apply.ts',
        'public-surface-only: app/modules/orders/queries.ts → app/modules/notifications/jobs/dispatch.ts',
        'public-surface-only: app/modules/shops/actions/invite.ts → app/modules/identity/internal/hash.ts',
        'rank-orders: app/modules/orders/queries.ts → app/modules/notifications/jobs/dispatch.ts',
        'rank-platform: app/modules/platform/jobs.ts → app/modules/identity/actions/sign_up.ts',
        'sdk-in-adapters-only: app/modules/catalog/actions/import_image.ts → node_modules/axios/index.js',
        'sdk-in-adapters-only: app/modules/identity/actions/notify.ts → node_modules/@adonisjs/mail/services/main.js',
      ])
    } finally {
      await tree.cleanup()
    }
  })
})
