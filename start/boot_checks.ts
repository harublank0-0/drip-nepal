import { existsSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import inertiaConfig from '#config/inertia'

/*
 * Boot refusal (docs/09 §6.5 item 2, RF-08): a production web process
 * without the SSR bundle would answer every page with a 500, so it refuses
 * to start instead and the deploy fails before taking traffic. Registered
 * for the `web` environment only (adonisrc.ts).
 *
 * @adonisjs/vite 6 builds the `serverEntryPoints` of vite.config.ts into
 * `public/assets/server/` and imports them through the manifest there, so
 * the manifest is what must exist (OD-25, Inertia adapter 5).
 */
export const SSR_MANIFEST = 'public/assets/server/.vite/manifest.json'

export function ssrBundleProblem(options: {
  inProduction: boolean
  ssrEnabled: boolean
  bundle: string
  exists: (path: string) => boolean
}) {
  if (!options.inProduction || !options.ssrEnabled || options.exists(options.bundle)) return null
  return `The SSR bundle ${options.bundle} is missing: run node ace build (docs/09 §6.5)`
}

const problem = ssrBundleProblem({
  inProduction: app.inProduction,
  ssrEnabled: inertiaConfig.ssr?.enabled ?? false,
  bundle: app.makePath(SSR_MANIFEST),
  exists: existsSync,
})
if (problem) throw new Error(problem)
