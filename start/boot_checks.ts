import { existsSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import inertiaConfig from '#config/inertia'

/*
 * Boot refusal (docs/09 §6.5 item 2, RF-08): a production web process
 * without the SSR bundle would answer every page with a 500, so it refuses
 * to start instead and the deploy fails before taking traffic. Registered
 * for the `web` environment only (adonisrc.ts).
 */
const bundle = inertiaConfig.ssr?.bundle ?? 'ssr/ssr.js'
if (app.inProduction && inertiaConfig.ssr?.enabled && !existsSync(app.makePath(bundle))) {
  throw new Error(`The SSR bundle ${bundle} is missing: run node ace build (docs/09 §6.5)`)
}
