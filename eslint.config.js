import { configApp } from '@adonisjs/eslint-config'
import { react } from '@adonisjs/eslint-config/react'

// Money code (docs/09 §11.2, ADR-0007): money is integer paisa, formatted
// only by shared/format/money.ts. T-ARCH-014 lints fixtures against these.
const MONEY_CODE = ['app/modules/**', 'shared/format/**', 'inertia/**']
const MONEY_GLOBALS = [{ name: 'parseFloat', message: 'Money is integer paisa (ADR-0007)' }]
// Configuration (docs/09 §6.3): only start/env*.ts and bin/* read the
// environment; everything else imports typed config.
const PROCESS_ENV = [
  {
    object: 'process',
    property: 'env',
    message: 'Read configuration from config/*.ts, not process.env (docs/09 §6.3)',
  },
]
const PROCESS_ENV_IMPORTS = ['process', 'node:process'].map((name) => ({
  name,
  importNames: ['env'],
  message: 'Read configuration from config/*.ts, not process.env (docs/09 §6.3)',
}))
const START_ENV_MESSAGE = 'Import typed config from #config/* (docs/09 §6.3)'
const SERVER_AND_UI = [
  'app/**',
  'start/**',
  'config/**',
  'providers/**',
  'commands/**',
  'database/**',
  'shared/**',
  'inertia/**',
]
const MONEY_PROPERTIES = [
  { object: 'Number', property: 'parseFloat', message: 'Money is integer paisa (ADR-0007)' },
  { property: 'toFixed', message: 'Format money only with formatNPR (shared/format/money.ts)' },
  { property: 'toLocaleString', message: 'Use formatNPR / formatDateTime (08 §11)' },
]

export default configApp(
  ...react,
  {
    // shadcn copies keep their upstream registry names (docs/09 §1.1 principle 5, §11.2)
    files: ['inertia/components/ui/**'],
    rules: {
      '@unicorn/filename-case': 'off',
    },
  },
  {
    // No console output: server code logs through pino, the browser logs no
    // data at all (docs/09 §7.5, RF-26).
    files: SERVER_AND_UI,
    rules: {
      'no-console': 'error',
    },
  },
  {
    // process.env stays in start/env*.ts (docs/09 §6.3), including
    // `import { env } from 'node:process'`.
    files: SERVER_AND_UI,
    ignores: ['start/env.ts', 'start/env_schema.ts'],
    rules: {
      'no-restricted-properties': ['error', ...PROCESS_ENV],
      'no-restricted-imports': ['error', { paths: PROCESS_ENV_IMPORTS }],
    },
  },
  {
    // Application code reads the environment through config/*.ts only (docs/09 §6.3).
    // This block replaces the one above's import list for these files, so it repeats it.
    files: ['app/**', 'inertia/**', 'shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...PROCESS_ENV_IMPORTS, { name: '#start/env', message: START_ENV_MESSAGE }],
          patterns: [{ group: ['**/start/env', '**/start/env.js'], message: START_ENV_MESSAGE }],
        },
      ],
    },
  },
  {
    // A later block that sets one of these rules for the same files replaces
    // this list (docs/09 §11.2, notes), so this block repeats PROCESS_ENV.
    files: MONEY_CODE,
    ignores: ['shared/format/money.ts'],
    rules: {
      'no-restricted-globals': ['error', ...MONEY_GLOBALS],
      'no-restricted-properties': ['error', ...MONEY_PROPERTIES, ...PROCESS_ENV],
    },
  },
  {
    // Claude Code puts agent worktrees here: full copies of the repository.
    ignores: ['.claude/worktrees/**'],
  }
)
