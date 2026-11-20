import { test } from '@japa/runner'
import { ssrBundleProblem } from '#start/boot_checks'

/*
 * The SSR-bundle boot refusal of docs/09 §6.5 item 2 (RF-08), under
 * T-ARCH-024's boot rules: a production web process without the bundle
 * refuses to start; development, a present bundle or SSR off do not.
 */
const base = {
  inProduction: true,
  ssrEnabled: true,
  bundle: '/app/public/assets/server/.vite/manifest.json',
}

test.group('T-ARCH-024 SSR bundle boot check', () => {
  test('production without the bundle refuses to boot', ({ assert }) => {
    assert.equal(
      ssrBundleProblem({ ...base, exists: () => false }),
      'The SSR bundle /app/public/assets/server/.vite/manifest.json is missing: run node ace build (docs/09 §6.5)'
    )
  })

  test('{name} boots')
    .with([
      { name: 'production with the bundle', values: { ...base, exists: () => true } },
      {
        name: 'development without it',
        values: { ...base, inProduction: false, exists: () => false },
      },
      { name: 'SSR off', values: { ...base, ssrEnabled: false, exists: () => false } },
    ])
    .run(({ assert }, { values }) => {
      assert.isNull(ssrBundleProblem(values))
    })
})
