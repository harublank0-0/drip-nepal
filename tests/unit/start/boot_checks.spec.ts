import { test } from '@japa/runner'
import { ssrBundleProblem } from '#start/boot_checks'

/*
 * The SSR-bundle boot refusal of docs/09 §6.5 item 2 (RF-08), under
 * T-ARCH-024's boot rules: a production web process refuses to start
 * without the SSR manifest, without an entry for `ssr.entrypoint` in it,
 * or without the bundle that entry names; development, a complete bundle
 * or SSR off do not (ADR-0020).
 */
const MANIFEST = '/app/public/assets/server/.vite/manifest.json'
const BUNDLE = '/app/public/assets/server/ssr.js'
const ENTRY = 'inertia/ssr.tsx'
const built = JSON.stringify({ [ENTRY]: { file: 'ssr.js', src: ENTRY, isEntry: true } })

const base = {
  inProduction: true,
  ssrEnabled: true,
  manifest: MANIFEST,
  entry: ENTRY,
  read: (path: string) => (path === MANIFEST ? built : null),
  exists: (path: string) => path === BUNDLE,
}

test.group('T-ARCH-024 SSR bundle boot check', () => {
  test('{name} refuses to boot')
    .with([
      {
        name: 'production without the manifest',
        values: { ...base, read: () => null },
        problem: `The SSR bundle manifest ${MANIFEST} is missing: run node ace build (docs/09 §6.5)`,
      },
      {
        name: 'a manifest without the ssr.entrypoint entry',
        values: { ...base, entry: 'inertia/other_ssr.tsx' },
        problem:
          'The SSR bundle manifest has no entry for inertia/other_ssr.tsx: list it under serverEntryPoints in vite.config.ts (docs/09 §6.5)',
      },
      {
        name: 'a manifest whose bundle is missing',
        values: { ...base, exists: () => false },
        problem: `The SSR bundle ${BUNDLE} is missing: run node ace build (docs/09 §6.5)`,
      },
      {
        name: 'a manifest that is not JSON',
        values: { ...base, read: () => '{' },
        problem: `The SSR bundle manifest ${MANIFEST} is not JSON: run node ace build (docs/09 §6.5)`,
      },
    ])
    .run(({ assert }, { values, problem }) => {
      assert.equal(ssrBundleProblem(values), problem)
    })

  test('{name} boots')
    .with([
      { name: 'production with a complete bundle', values: base },
      {
        name: 'development without one',
        values: { ...base, inProduction: false, read: () => null },
      },
      { name: 'SSR off', values: { ...base, ssrEnabled: false, read: () => null } },
    ])
    .run(({ assert }, { values }) => {
      assert.isNull(ssrBundleProblem(values))
    })
})
