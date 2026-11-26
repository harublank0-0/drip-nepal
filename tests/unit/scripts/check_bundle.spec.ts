import { test } from '@japa/runner'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { fixtureTree, runScript } from '#tests/support/scripts'

/*
 * The checks of scripts/check_bundle.mjs on a fixture build (docs/08 §10.1,
 * docs/09 §13.8): T-UI-012 (initial JavaScript per route within its gzip
 * budget, counting the surface layout and catalog a page loads with it, and
 * no dashboard layout on a storefront route), T-UI-013 (no devtools strings) and T-ARCH-002's build-output
 * part (the SSR bundle holds only the server-rendered surfaces). CI runs
 * the script on the real build after `node ace build`.
 */

const CONFIG =
  "export const SSR_SURFACES = ['storefront/', 'auth/', 'payments/', 'errors/'] as const\n"
// Random base64 barely compresses: 400,000 characters gzip to about 300 KB.
const heavy = () => `export const x = "${randomBytes(300_000).toString('base64')}"\n`
const small = 'export default function Page() { return null }\n'

type Chunk = { file: string; imports?: string[]; isEntry?: boolean; isDynamicEntry?: boolean }

function build(options: {
  chunks?: Record<string, Chunk>
  files?: Record<string, string>
  ssr?: string
  config?: string
}) {
  const chunks: Record<string, Chunk> = {
    'inertia/app.tsx': { file: 'app.js', isEntry: true },
    'inertia/pages/storefront/home.tsx': { file: 'home.js', isDynamicEntry: true },
    ...options.chunks,
  }
  return fixtureTree({
    'config/inertia.ts': options.config ?? CONFIG,
    'assets/.vite/manifest.json': JSON.stringify(chunks),
    'assets/app.js': small,
    'assets/home.js': small,
    ...Object.fromEntries(
      Object.entries(options.files ?? {}).map(([name, text]) => [`assets/${name}`, text])
    ),
    'assets/server/.vite/manifest.json': JSON.stringify({
      'inertia/ssr.tsx': { file: 'ssr.js', isEntry: true },
    }),
    'assets/server/ssr.js':
      options.ssr ??
      'const pages = { "./pages/storefront/home.tsx": a, "./pages/errors/not_found.tsx": b }\n',
  })
}

async function check(options: Parameters<typeof build>[0]) {
  const tree = await build(options)
  try {
    return await runScript('check_bundle.mjs', [
      '--assets',
      join(tree.root, 'assets'),
      '--config',
      join(tree.root, 'config/inertia.ts'),
    ])
  } finally {
    await tree.cleanup()
  }
}

test.group('T-UI-012 initial JavaScript per route', (group) => {
  group.each.timeout(30_000)

  test('T-UI-012 a small build passes and reports each route', async ({ assert }) => {
    const result = await check({})
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /^storefront\/home: \d+\.\d KB of 250 KB \(storefront\)$/m)
  })

  test('T-UI-012 a storefront route over 250 KB fails', async ({ assert }) => {
    const result = await check({ files: { 'home.js': heavy() } })
    assert.equal(result.code, 1)
    assert.include(result.stderr, 'T-UI-012: storefront/home loads')
    assert.include(result.stderr, 'over the storefront budget of 250 KB')
  })

  test('T-UI-012 a chunk the entry imports statically counts for every route', async ({
    assert,
  }) => {
    const result = await check({
      chunks: {
        'inertia/app.tsx': { file: 'app.js', isEntry: true, imports: ['_vendor.js'] },
        '_vendor.js': { file: 'vendor.js' },
      },
      files: { 'vendor.js': heavy() },
    })
    assert.equal(result.code, 1)
    assert.include(result.stderr, 'T-UI-012: storefront/home loads')
  })

  test('T-UI-012 a page that imports a heavy chunk fails, transitively', async ({ assert }) => {
    const result = await check({
      chunks: {
        'inertia/pages/storefront/home.tsx': {
          file: 'home.js',
          isDynamicEntry: true,
          imports: ['_a.js'],
        },
        '_a.js': { file: 'a.js', imports: ['_b.js'] },
        '_b.js': { file: 'b.js' },
      },
      files: { 'a.js': small, 'b.js': heavy() },
    })
    assert.equal(result.code, 1)
    assert.include(result.stderr, 'T-UI-012: storefront/home loads')
  })

  test('T-UI-012 the same weight passes on a seller route, under the 500 KB budget', async ({
    assert,
  }) => {
    const result = await check({
      chunks: {
        'inertia/pages/storefront/home.tsx': { file: 'home.js', isDynamicEntry: true },
        'inertia/pages/seller/orders/index.tsx': { file: 'orders.js', isDynamicEntry: true },
        'inertia/layouts/seller_layout.tsx': { file: 'seller_layout.js', isDynamicEntry: true },
      },
      files: { 'orders.js': heavy(), 'seller_layout.js': small },
    })
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /^seller\/orders\/index: .* of 500 KB \(dashboard\)$/m)
  })

  test('T-UI-012 a dashboard layout that is not a chunk loaded on demand fails', async ({
    assert,
  }) => {
    // A static import inlines the layout into the entry: the manifest then lists no chunk for it.
    const result = await check({
      chunks: {
        'inertia/pages/admin/logistics.tsx': { file: 'logistics.js', isDynamicEntry: true },
      },
      files: { 'logistics.js': small },
    })
    assert.equal(result.code, 1)
    assert.include(
      result.stderr,
      'T-UI-012: inertia/layouts/admin_layout.tsx is not a chunk loaded on demand'
    )
  })

  test('T-UI-012 a catalog loaded on demand that no page counts fails', async ({ assert }) => {
    const result = await check({
      chunks: {
        'resources/lang/en/dashboards.json': { file: 'dashboards.js', isDynamicEntry: true },
      },
      files: { 'dashboards.js': small },
    })
    assert.equal(result.code, 1)
    assert.include(
      result.stderr,
      'T-UI-012: resources/lang/en/dashboards.json is loaded on demand but no page counts it'
    )
  })

  test('T-UI-012 a dashboard page counts the layout and catalog it loads with it', async ({
    assert,
  }) => {
    const result = await check({
      chunks: {
        'inertia/pages/seller/products.tsx': { file: 'products.js', isDynamicEntry: true },
        'inertia/layouts/seller_layout.tsx': {
          file: 'seller_layout.js',
          isDynamicEntry: true,
          imports: ['_sidebar.js'],
        },
        '_sidebar.js': { file: 'sidebar.js' },
        'resources/lang/en/seller.json': { file: 'seller.js', isDynamicEntry: true },
      },
      files: {
        'products.js': heavy(),
        'seller_layout.js': small,
        'sidebar.js': heavy(),
        'seller.js': small,
      },
    })
    assert.equal(result.code, 1)
    assert.include(result.stderr, 'T-UI-012: seller/products loads')
    assert.include(result.stderr, 'over the dashboard budget of 500 KB')
    // The storefront page does not load the seller surface's chunks.
    assert.notInclude(result.stderr, 'T-UI-012: storefront/home loads')
  })

  test('T-UI-012 a storefront page that loads a dashboard layout fails, whatever its size', async ({
    assert,
  }) => {
    // Imported statically by a storefront page and on demand by layout_for.ts: Vite gives it a
    // chunk of its own, which the page's chunk imports.
    const result = await check({
      chunks: {
        'inertia/pages/storefront/home.tsx': {
          file: 'home.js',
          isDynamicEntry: true,
          imports: ['inertia/layouts/admin_layout.tsx'],
        },
        'inertia/layouts/admin_layout.tsx': { file: 'admin_layout.js', isDynamicEntry: true },
      },
      files: { 'admin_layout.js': small },
    })
    assert.equal(result.code, 1)
    assert.include(
      result.stderr,
      'T-UI-012: storefront/home loads the dashboard layout inertia/layouts/admin_layout.tsx'
    )
  })

  test('T-UI-012 an import the manifest does not list fails, not goes uncounted', async ({
    assert,
  }) => {
    const result = await check({
      chunks: { 'inertia/app.tsx': { file: 'app.js', isEntry: true, imports: ['_gone.js'] } },
    })
    assert.equal(result.code, 1)
    assert.include(result.stderr, 'the client manifest imports _gone.js, which it does not list')
  })

  test('T-UI-012 a build with no client entry fails', async ({ assert }) => {
    const noEntry = await check({
      chunks: { 'inertia/app.tsx': { file: 'app.js' } },
    })
    assert.equal(noEntry.code, 1)
    assert.include(noEntry.stderr, 'the client manifest has no inertia/app.tsx entry')
  })
})

test.group('T-UI-013 no devtools strings in the production build', (group) => {
  group.each.timeout(30_000)

  test('T-UI-013 fails on {needle} in {file}')
    .with([
      { needle: 'TanStackDevtools', file: 'app.js' },
      { needle: 'react-form-devtools', file: 'server/ssr.js' },
    ])
    .run(async ({ assert }, { needle, file }) => {
      const text = `const tool = "${needle}"\n`
      const result = await check(
        file === 'app.js'
          ? { files: { 'app.js': text } }
          : { ssr: `const pages = { "./pages/errors/not_found.tsx": a }\n${text}` }
      )
      assert.equal(result.code, 1)
      assert.include(result.stderr, `T-UI-013: ${file} contains ${needle}`)
    })
})

test.group('T-ARCH-002 the SSR bundle holds only the server-rendered surfaces', (group) => {
  group.each.timeout(30_000)

  test('T-ARCH-002 a page outside SSR_SURFACES in the SSR bundle fails', async ({ assert }) => {
    const result = await check({
      ssr: 'const pages = { "./pages/errors/not_found.tsx": a, "./pages/dev/overlays.tsx": b }\n',
    })
    assert.equal(result.code, 1)
    assert.include(result.stderr, 'T-ARCH-002: the SSR bundle holds dev/overlays')
  })

  test('T-ARCH-002 the surfaces come from config/inertia.ts', async ({ assert }) => {
    const result = await check({ config: "export const SSR_SURFACES = ['errors/'] as const\n" })
    assert.equal(result.code, 1)
    assert.include(result.stderr, 'the SSR bundle holds storefront/home, outside')
  })

  test('T-ARCH-002 an SSR bundle with no page, or no surface list, fails', async ({ assert }) => {
    const empty = await check({ ssr: 'export {}\n' })
    assert.equal(empty.code, 1)
    assert.include(empty.stderr, 'the SSR bundle ssr.js holds no page')
    const noList = await check({ config: 'export {}\n' })
    assert.equal(noList.code, 1)
    assert.include(noList.stderr, 'no SSR_SURFACES list in')
  })
})
