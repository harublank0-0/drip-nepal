/*
 * T-ARCH-001 (docs/09 §2.4, docs/03 §4.3): the module dependency rules of
 * docs/09 §2.2, run by dependency-cruiser over app/, start/ and database/
 * (`pnpm lint:arch`). T-SEC-016 is rule 8: outbound HTTP only inside a
 * module's providers/ folder. The fetch and WebSocket globals, which no
 * import rule can see, are banned by eslint.config.js.
 */

// The canonical chain of docs/03 §4.1, lowest first.
const ORDER = [
  'platform',
  'audit',
  'logistics',
  'identity',
  'shops',
  'media',
  'catalog',
  'inventory',
  'pricing',
  'cart',
  'checkout',
]
// Beyond the chain: checkout may use orders and what they may use; orders
// may use payments and ledger; payments may use ledger (docs/09 §2.2).
const EXTRA = {
  orders: ['payments', 'ledger'],
  payments: ['ledger'],
  checkout: ['orders', 'payments', 'ledger'],
}
// May use everything up to pricing (docs/03 §4.1).
const RIGHT = ['orders', 'payments', 'ledger']
// Another module's private folders (docs/09 §2.1).
const PRIVATE = '(domain|jobs|providers|internal)'
const MODULES = [...ORDER, ...RIGHT, 'notifications']

function allowedFor(module) {
  if (module === 'notifications') return [...ORDER, ...RIGHT] // queries.ts only, rule 4
  const rank = RIGHT.includes(module) ? ORDER.indexOf('pricing') : ORDER.indexOf(module) - 1
  return [...ORDER.slice(0, rank + 1), ...(EXTRA[module] ?? [])]
}

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // 1. No cycles in app/ outside app/models/: Lucid models declare their
    // relations on both sides (docs/09 §2.4 note "Model cycles").
    {
      name: 'no-cycles',
      comment: 'No import cycles in app/ (docs/09 §2.4 rule 1)',
      severity: 'error',
      from: { path: '^app/', pathNot: '^app/models/' },
      to: { circular: true, viaOnly: { pathNot: '^app/models/' } },
    },
    // 2. Another module's private folders are off limits.
    {
      name: 'public-surface-only',
      comment: "Import another module's actions/, queries.ts or events.ts only (docs/09 §2.1)",
      severity: 'error',
      from: { path: '^app/modules/([^/]+)/' },
      to: { path: `^app/modules/([^/]+)/${PRIVATE}/`, pathNot: '^app/modules/$1/' },
    },
    // 3. Rank rule: no upward imports, one rule per module.
    ...MODULES.map((module) => ({
      name: `rank-${module}`,
      comment: `${module} imports only the modules docs/09 §2.2 allows it`,
      severity: 'error',
      from: { path: `^app/modules/${module}/` },
      to: {
        path: '^app/modules/[^/]+/',
        pathNot: `^app/modules/(${[module, ...allowedFor(module)].join('|')})/`,
      },
    })),
    // 4. notifications may read queries.ts only; nobody imports notifications.
    {
      name: 'notifications-read-only',
      comment: 'notifications reads queries.ts, never actions/ or events.ts (docs/09 §2.3 item 7)',
      severity: 'error',
      from: { path: '^app/modules/notifications/' },
      to: { path: '^app/modules/(?!notifications/|platform/)[^/]+/(actions/|events\\.ts)' },
    },
    {
      name: 'nobody-imports-notifications',
      comment: 'No module imports notifications (docs/09 §2.2)',
      severity: 'error',
      from: { path: '^app/', pathNot: '^app/modules/notifications/' },
      to: { path: '^app/modules/notifications/' },
    },
    // 5. A module and its models import only models of tables it or a
    // lower module owns.
    ...require('./architecture/model_rules.cjs')(
      require('./architecture/model-ownership.json'),
      allowedFor,
      MODULES
    ),
    // 6. Controllers: models as types only, and no db service (they open no
    // transaction).
    {
      name: 'controllers-no-model-values',
      comment: 'Controllers use models as types only (docs/09 §2.4 rule 6)',
      severity: 'error',
      from: { path: '^app/controllers/' },
      to: { path: '^app/models/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'controllers-no-db',
      comment: 'Controllers open no transaction and run no query (docs/09 §2.4 rule 6)',
      severity: 'error',
      from: { path: '^app/controllers/' },
      to: { path: '@adonisjs/lucid/(build/)?services/db' },
    },
    // 7. Migrations import nothing from the application (RF-41, docs/04 §20.2.2).
    {
      name: 'migrations-self-contained',
      comment: 'Migrations import nothing from app/, shared/ or start/ (docs/09 §8.2)',
      severity: 'error',
      from: { path: '^database/migrations/' },
      to: { path: '^(app|shared|start)/' },
    },
    // 8. Provider SDKs and outbound HTTP only inside adapters (ADR-0016,
    // docs/07 §7.4 and TM-13): T-SEC-016.
    {
      name: 'sdk-in-adapters-only',
      comment: 'HTTP clients and provider SDKs only in providers/ (T-SEC-016, docs/07 TM-13)',
      severity: 'error',
      from: { path: '^(app|start)/', pathNot: '^app/modules/[^/]+/providers/' },
      to: {
        path: 'node_modules/(@aws-sdk|nodemailer|ky|undici|axios|got|node-fetch)/',
      },
    },
    {
      name: 'core-network-in-adapters-only',
      comment: 'Node network modules only in providers/ (T-SEC-016, docs/07 TM-13)',
      severity: 'error',
      from: { path: '^(app|start)/', pathNot: '^app/modules/[^/]+/providers/' },
      to: { dependencyTypes: ['core'], path: '^(node:)?(http|https|http2|net|tls|dgram)$' },
    },
    // Unresolvable imports would hide every rule above.
    {
      name: 'not-to-unresolvable',
      comment: 'An import that cannot be resolved escapes every rule',
      severity: 'error',
      from: { path: '^(app|start|database)/' },
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    includeOnly: { path: '^(app|start|database|shared|config|node_modules)/|^(node:)?[a-z]' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    combinedDependencies: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.d.ts'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    skipAnalysisNotInRules: true,
  },
}
