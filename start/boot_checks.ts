import { existsSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import inertiaConfig from '#config/inertia'

/*
 * Boot refusal (docs/09 §6.5 item 2, RF-08): a production web process
 * without the SSR bundle would answer every page with a 500, so it refuses
 * to start instead and the deploy fails before taking traffic. Registered
 * for the `web` environment only (adonisrc.ts).
 */
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
  bundle: app.makePath(inertiaConfig.ssr?.bundle ?? 'ssr/ssr.js'),
  exists: existsSync,
})
if (problem) throw new Error(problem)
