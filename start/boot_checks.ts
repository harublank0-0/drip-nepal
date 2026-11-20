import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import app from '@adonisjs/core/services/app'
import inertiaConfig from '#config/inertia'

/*
 * Boot refusal (docs/09 §6.5 item 2, RF-08): a production web process
 * without the SSR bundle would answer every page with a 500, so it refuses
 * to start instead and the deploy fails before taking traffic. Registered
 * for the `web` environment only (adonisrc.ts).
 *
 * @adonisjs/vite 6 builds the `serverEntryPoints` of vite.config.ts into
 * `public/assets/server/` and imports each through the manifest there, by
 * the entry's source path (ADR-0020). So the check reads that manifest,
 * finds the `ssr.entrypoint` of config/inertia.ts in it, and checks the
 * file it names: an entry point missing from `serverEntryPoints` passes the
 * build but fails the first request.
 */
export const SSR_MANIFEST = 'public/assets/server/.vite/manifest.json'

export function ssrBundleProblem(options: {
  inProduction: boolean
  ssrEnabled: boolean
  manifest: string
  entry: string
  read: (path: string) => string | null
  exists: (path: string) => boolean
}) {
  if (!options.inProduction || !options.ssrEnabled) return null
  const fix = 'run node ace build (docs/09 §6.5)'
  const text = options.read(options.manifest)
  if (text === null) return `The SSR bundle manifest ${options.manifest} is missing: ${fix}`
  let chunk: unknown
  try {
    chunk = (JSON.parse(text) as Record<string, unknown>)[options.entry]
  } catch {
    return `The SSR bundle manifest ${options.manifest} is not JSON: ${fix}`
  }
  const file = (chunk as { file?: unknown } | undefined)?.file
  if (typeof file !== 'string') {
    return `The SSR bundle manifest has no entry for ${options.entry}: list it under serverEntryPoints in vite.config.ts (docs/09 §6.5)`
  }
  // The manifest sits in <server>/.vite/; the bundle in <server>/.
  const bundle = join(dirname(dirname(options.manifest)), file)
  if (!options.exists(bundle)) return `The SSR bundle ${bundle} is missing: ${fix}`
  return null
}

const problem = ssrBundleProblem({
  inProduction: app.inProduction,
  ssrEnabled: inertiaConfig.ssr?.enabled ?? false,
  // @adonisjs/vite resolves its build directory from the working directory.
  manifest: resolve(SSR_MANIFEST),
  entry: inertiaConfig.ssr?.entrypoint ?? '(ssr.entrypoint is not set in config/inertia.ts)',
  read: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
  exists: existsSync,
})
if (problem) throw new Error(problem)
