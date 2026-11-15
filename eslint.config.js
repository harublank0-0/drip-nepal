import { configApp } from '@adonisjs/eslint-config'
import { react } from '@adonisjs/eslint-config/react'
import jsxA11y from 'eslint-plugin-jsx-a11y'

/*
 * DripNepal's lint rules (docs/09 §11.2, §11.3, §13.9). Every custom rule
 * has failing and passing fixtures in tests/unit/lint/ (T-ARCH-021,
 * T-ARCH-014, T-SEC-016, T-UI-029): a selector or `files` glob that matches
 * nothing is a silent hole.
 *
 * ESLint flat config applies the last matching block for a rule name, so a
 * later block replaces an earlier list instead of adding to it. Each
 * `no-restricted-*` list is therefore built here from the shared arrays
 * below, once per path group, and every block for a path repeats what an
 * earlier block for the same path set.
 */

// ---- shared entries --------------------------------------------------------

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
// Patterns are regexes: in the gitignore syntax of `group`, a leading # starts
// a comment, so a group such as '#start/env' would match nothing.
const START_ENV_PATTERNS = [
  { regex: '^(#start/env|.*/start/env(\\.js)?)$', message: START_ENV_MESSAGE },
]

// Money (ADR-0007): integer paisa, formatted only by shared/format/money.ts.
const MONEY_GLOBALS = [{ name: 'parseFloat', message: 'Money is integer paisa (ADR-0007)' }]
const MONEY_PROPERTIES = [
  { object: 'Number', property: 'parseFloat', message: 'Money is integer paisa (ADR-0007)' },
  { property: 'toFixed', message: 'Format money only with formatNPR (shared/format/money.ts)' },
  { property: 'toLocaleString', message: 'Use formatNPR / formatDateTime (08 §11)' },
]

// Every Lucid/Knex helper that takes raw SQL (docs/07 TM-12).
const RAW_SQL =
  'rawQuery|raw|knexRawQuery|whereRaw|orWhereRaw|andWhereRaw|havingRaw|orHavingRaw|andHavingRaw|orderByRaw|groupByRaw|joinRaw'
// A selector of the form `A > :matches(B, C > D)` never matches D under C
// under A, so each nesting gets its own entry.
const MASS_ASSIGNMENT = [
  {
    selector: 'CallExpression[callee.property.name=/^(create|merge|fill)$/] > SpreadElement',
    message: 'No mass assignment: assign columns one by one (07 §7.4, RF-36)',
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(create|merge|fill)$/] > ObjectExpression > SpreadElement',
    message: 'No mass assignment: assign columns one by one (07 §7.4, RF-36)',
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(create|merge|fill)$/] > Identifier[name=/^(payload|data|body|input)$/]',
    message: 'No mass assignment from a validated payload (07 §7.4)',
  },
]
const SQL_BINDINGS = [
  {
    selector: `CallExpression[callee.property.name=/^(${RAW_SQL})$/] > TemplateLiteral[expressions.length>0]`,
    message: 'Use bindings, never ${} in SQL (07 §7.4, TM-12)',
  },
  {
    selector: `CallExpression[callee.property.name=/^(${RAW_SQL})$/] > TaggedTemplateExpression > TemplateLiteral[expressions.length>0]`,
    message: 'Use bindings, never ${} in SQL (07 §7.4, TM-12)',
  },
  {
    selector: `CallExpression[callee.property.name=/^(${RAW_SQL})$/] > BinaryExpression[operator='+']`,
    message: 'Use bindings, never string concatenation in SQL (07 §7.4, TM-12)',
  },
]
const TRANSACTIONS = [
  {
    selector: "CallExpression[callee.object.name='db'][callee.property.name='transaction']",
    message: 'Open transactions only through withTx/jobTx (09 §3.8)',
  },
]
// T-SEC-016: the globals no import rule can see (docs/09 §2.4 rule 8).
const OUTBOUND = [
  {
    selector:
      ":matches(CallExpression[callee.name='fetch'], NewExpression[callee.name='WebSocket'], MemberExpression[object.name='globalThis'][property.name=/^(fetch|WebSocket)$/])",
    message: 'Outbound HTTP only inside providers/ adapters (09 §2.4 rule 8, 07 TM-13)',
  },
]
const NO_MODEL_RESPONSES = [
  {
    selector: 'CallExpression[callee.property.name=/^(serialize|toJSON)$/]',
    message: 'Controllers return transformer output, never models (09 §2.4, 06 §3.6)',
  },
]
const APP_IMPORTS = {
  paths: PROCESS_ENV_IMPORTS,
  patterns: [
    ...START_ENV_PATTERNS,
    {
      regex: '^#database/factories/',
      message: 'Factories are for tests and dev seeders (09 §8.8)',
    },
  ],
}
const TS_STRICTNESS = {
  '@typescript-eslint/ban-ts-comment': [
    'error',
    { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true, 'ts-nocheck': true },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
}

// The `database/` rules (docs/09 §8, §9.2).
const DATABASE_SYNTAX = [
  {
    selector: 'Property[key.name=/^password/] > Literal[value=/./]',
    message: 'No literal passwords in seeders or factories (09 §9.2)',
  },
  {
    selector: "CallExpression[callee.property.name='raw'] > TemplateLiteral[expressions.length>0]",
    message: 'Migrations contain literals only (09 §8.6)',
  },
  {
    // String.raw`…` is the allowed form; ${} inside it is still refused.
    selector:
      "CallExpression[callee.property.name='raw'] > TaggedTemplateExpression > TemplateLiteral[expressions.length>0]",
    message: 'Migrations contain literals only (09 §8.6)',
  },
  {
    selector:
      "CallExpression[callee.object.property.name='schema'][callee.property.name='raw'] > :matches(TemplateLiteral, Literal)",
    message: 'Pass migration SQL as String.raw`…` and escape each ? as \\? (09 §8.6)',
  },
]
// ADR-0011 decision 3: migrations import nothing from the application.
const MIGRATION_IMPORTS = {
  patterns: [
    {
      regex: '^#(constants|models|modules|start|shared)/',
      message: 'Migrations are self-contained; write value lists as literals (ADR-0011)',
    },
  ],
}

// The frontend (docs/08 §12, docs/09 §13).
const INERTIA_IMPORTS = {
  paths: [
    ...PROCESS_ENV_IMPORTS,
    { name: 'cn', message: 'Import cn from ~/lib/utils (ADR-0015, 08 §12)' },
    {
      name: '@inertiajs/react',
      importNames: ['useForm', 'Form'],
      message: 'Writes go through the typed Tuyau client and apiCall (09 §13.4)',
    },
    {
      name: '@adonisjs/inertia/react',
      importNames: ['useTuyau'],
      message: 'useTuyau is untyped; use the typed client (09 §13.4)',
    },
  ],
  patterns: [
    ...START_ENV_PATTERNS,
    { group: ['next/*'], message: 'Not a Next.js app (ADR-0015)' },
    { group: ['@base-ui/react', '@base-ui/react/*'], message: 'Radix only (08 §4.2)' },
    {
      group: ['zod', 'react-hook-form', 'formik'],
      message: 'One form stack: TanStack Form (09 §13)',
    },
  ],
}
const STORAGE_GLOBALS = ['localStorage', 'sessionStorage'].map((name) => ({
  name,
  message: 'Use inertia/lib/storage.ts, which is safe during SSR (09 §13.8 rule 1)',
}))
// ui/ and kit/ import only ui/ and ~/lib/utils (08 §12.1).
const COPIED_IMPORTS = (folder) => ({
  ...INERTIA_IMPORTS,
  patterns: [
    ...INERTIA_IMPORTS.patterns,
    {
      // A regex: the sketch's gitignore pair ('~/components/*' with
      // '!~/components/ui/*') also refused ~/components/ui/*, because a
      // negation cannot re-include a path whose parent folder is excluded.
      regex: '^~/components/(?!ui/)',
      message: `${folder}/ imports only ui/ and ~/lib/utils (08 §12.1)`,
    },
  ],
})

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
const A11Y_FILES = ['inertia/**/*.tsx']
const A11Y_IGNORES = ['inertia/components/ui/**']

export default configApp(
  ...react,
  {
    // Vendored text, generated output and the documentation are not linted;
    // Claude Code puts agent worktrees (full copies) under .claude/worktrees/.
    ignores: ['.agents/**', 'docs/**', 'tmp/**', '.claude/worktrees/**'],
  },
  {
    // shadcn copies keep their upstream registry names (docs/09 §1.1 principle 5, §11.2)
    files: ['inertia/components/ui/**'],
    rules: { '@unicorn/filename-case': 'off' },
  },
  {
    // No console output: server code logs through pino, the browser logs no
    // data at all (docs/09 §7.5, RF-26).
    files: SERVER_AND_UI,
    rules: { 'no-console': 'error' },
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

  // ---- server layers (docs/09 §2.4, §3, §6.3, docs/07 §7.4) ----------------
  {
    files: ['app/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', APP_IMPORTS],
      'no-restricted-syntax': [
        'error',
        ...MASS_ASSIGNMENT,
        ...SQL_BINDINGS,
        ...TRANSACTIONS,
        ...OUTBOUND,
      ],
      ...TS_STRICTNESS,
    },
  },
  {
    // Adapters are the one place outbound HTTP may happen (T-SEC-016).
    files: ['app/modules/*/providers/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...MASS_ASSIGNMENT, ...SQL_BINDINGS, ...TRANSACTIONS],
    },
  },
  {
    // withTx and jobTx (docs/09 §3.8) are the one db.transaction caller.
    files: ['app/modules/platform/tx.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...MASS_ASSIGNMENT, ...SQL_BINDINGS, ...OUTBOUND],
    },
  },
  {
    files: ['app/controllers/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...MASS_ASSIGNMENT,
        ...SQL_BINDINGS,
        ...TRANSACTIONS,
        ...OUTBOUND,
        ...NO_MODEL_RESPONSES,
      ],
    },
  },

  // ---- money (ADR-0007, 08 §12.3); T-ARCH-014 ------------------------------
  {
    files: ['app/modules/**', 'shared/format/**'],
    ignores: ['shared/format/money.ts'],
    rules: {
      'no-restricted-globals': ['error', ...MONEY_GLOBALS],
      'no-restricted-properties': ['error', ...MONEY_PROPERTIES, ...PROCESS_ENV],
    },
  },
  {
    files: ['shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: PROCESS_ENV_IMPORTS, patterns: START_ENV_PATTERNS },
      ],
    },
  },

  // ---- database/ (docs/09 §8, §9.2) ----------------------------------------
  {
    files: ['database/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...DATABASE_SYNTAX] },
  },
  {
    files: ['database/migrations/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: PROCESS_ENV_IMPORTS, ...MIGRATION_IMPORTS }],
    },
  },

  // ---- frontend (docs/08 §12, docs/09 §13) ---------------------------------
  {
    files: ['inertia/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', INERTIA_IMPORTS],
      'no-restricted-globals': ['error', ...MONEY_GLOBALS, ...STORAGE_GLOBALS],
      'no-restricted-properties': ['error', ...MONEY_PROPERTIES, ...PROCESS_ENV],
      // The reviewed JSON-LD helper disables it inline with a reason (07 §7.4).
      'react/no-danger': 'error',
      ...TS_STRICTNESS,
    },
  },
  {
    // The one module that reads and writes browser storage, SSR-safely.
    files: ['inertia/lib/storage.ts'],
    rules: { 'no-restricted-globals': ['error', ...MONEY_GLOBALS] },
  },
  {
    files: ['inertia/components/ui/**'],
    rules: { 'no-restricted-imports': ['error', COPIED_IMPORTS('ui')] },
  },
  {
    files: ['inertia/components/kit/**'],
    rules: { 'no-restricted-imports': ['error', COPIED_IMPORTS('kit')] },
  },

  // ---- accessibility (docs/09 §13.9); T-UI-029 -----------------------------
  {
    ...jsxA11y.flatConfigs.recommended,
    files: A11Y_FILES,
    ignores: A11Y_IGNORES,
    settings: {
      'jsx-a11y': {
        // DripNepal's components, so the label and alt rules reach them.
        components: { Button: 'button', Input: 'input', Link: 'a', Textarea: 'textarea' },
      },
    },
  },
  {
    files: A11Y_FILES,
    ignores: A11Y_IGNORES,
    rules: {
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/no-autofocus': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
    },
  }
)
