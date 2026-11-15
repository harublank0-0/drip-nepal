import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/*
 * `node ace codegen:routes` (proposed name): writes the generated route files
 * that only the dev server writes, so CI can check them (T-ARCH-016, docs/09
 * §1.4). The test runner and the bundler run the assembler's `init` hooks,
 * which index controllers, pages and transformers, but not the route hooks:
 *
 * - `.adonisjs/server/routes.d.ts`, which `@adonisjs/core`'s app provider
 *   writes from the committed router (its `emitRoutes`);
 * - `.adonisjs/client/registry/{index.ts,schema.d.ts,tree.d.ts}`, which
 *   Tuyau's `generateRegistry()` hook (adonisrc.ts) writes on the dev
 *   server's `routesScanned` event.
 *
 * This command boots the app (routes preloaded), commits the router, writes
 * routes.d.ts as `emitRoutes` does, then runs the `routesScanning` and `routesScanned` hooks of
 * `generateRegistry()` over the assembler's RoutesScanner, as the dev server
 * does. Development and CI only: the assembler is a devDependency, so it is
 * imported when the command runs, and the command refuses production.
 */
type RouteHook = (server: unknown, scanner: unknown) => unknown

export default class CodegenRoutes extends BaseCommand {
  static commandName = 'codegen:routes'
  static description =
    'Write .adonisjs/server/routes.d.ts and the Tuyau registry as the dev server does (T-ARCH-016)'
  static options: CommandOptions = { startApp: true }

  async run() {
    if (this.app.inProduction) {
      this.logger.error('codegen:routes runs in development and CI only')
      this.exitCode = 1
      return
    }

    const router = await this.app.container.make('router')
    if (!router.commited) router.commit()

    // The file `emitRoutes` of @adonisjs/core 7.3's app provider writes (a
    // protected method), line for line; its routes.json is for the dev server.
    const { routes, imports, types } = router.generateTypes(2)
    const routesTypes = this.app.generatedServerPath('routes.d.ts')
    await mkdir(dirname(routesTypes), { recursive: true })
    await writeFile(
      routesTypes,
      [
        `import '@adonisjs/core/types/http'`,
        ...imports,
        '',
        ...types,
        '',
        'export type ScannedRoutes = {',
        routes,
        '}',
        `declare module '@adonisjs/core/types/http' {`,
        '  export interface RoutesList extends ScannedRoutes {}',
        '}',
      ].join('\n')
    )

    const { generateRegistry } = await import('@tuyau/core/hooks')
    const { RoutesScanner } = await import('@adonisjs/assembler/routes_scanner')
    const hooks: Record<string, RouteHook[]> = {}
    const server = { ui: { logger: { info: () => {} } } }
    // The hook object adonisrc.ts registers; its type is the assembler's
    // DefineHook, whose `run` is called with the dev server and its hooks.
    const registryHook = generateRegistry() as unknown as {
      run: (
        parent: unknown,
        hookRegistry: { add: (name: string, hook: RouteHook) => void }
      ) => unknown
    }
    await registryHook.run(server, {
      add: (name, hook) => (hooks[name] ??= []).push(hook),
    })

    const scanner = new RoutesScanner(fileURLToPath(this.app.appRoot).replace(/\\/g, '/'), [])
    for (const hook of hooks.routesScanning ?? []) await hook(server, scanner)
    const routesList = router.toJSON()
    for (const domain of Object.keys(routesList)) await scanner.scan(routesList[domain] as never)
    for (const hook of hooks.routesScanned ?? []) await hook(server, scanner)

    this.logger.success('wrote .adonisjs/server/routes.d.ts and .adonisjs/client/registry/')
  }
}
