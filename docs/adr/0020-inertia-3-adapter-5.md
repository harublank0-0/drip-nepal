# ADR-0020: Inertia 3 with @adonisjs/inertia 5, from the M0 spike

Status: Draft v1 (2026-11-20)

## Status

- **Decision status:** Accepted
- **Date:** 2026-11-20
- **Deciders:** lead developer (OD-25 spike), product owner (OD-25, 2026-09-30)
- **Supersedes / superseded by:** — / —. Closes OD-25 and R-22. Changes the version notes of [ADR-0003](0003-inertia-ssr-storefront-csr-dashboards.md) and [ADR-0004](0004-inertia-reads-json-api-writes.md), not their decisions.
- **Related open items:** none

## Context

OD-25 was decided on 2026-09-30: try the upgrade to `@adonisjs/inertia` 5, `@inertiajs/react` 3 and `@adonisjs/vite` 6 as a 2–3 day time-boxed spike at the start of M0, before the SSR fix (RF-08), and stay on 4.2.0 if it fails ([09 §10.5](../09-code-structure-and-engineering-standards.md#105-the-inertia-v5-upgrade-od-25)). The installed adapter 4.2.0 targets Inertia 2, which npm now tags `legacy`, while the AdonisJS documentation shows the adapter 5 APIs (R-22). Every page written on 4.2.0 would have to move later.

**What the spike found** [Verified-repo, branch `spike/inertia-v5`, 2026-11-20]:

- Adapter 5.0.5 needs `@inertiajs/react` ^3.4.0 and `@adonisjs/vite` ^6. Version 6.0.4 of `@adonisjs/vite` needs Vite ^8 and `@adonisjs/core` ^7.5.0, and core 7.7.0 needs `@adonisjs/assembler` ^8.6.0. So the upgrade cannot be the three packages alone that 09 §10.5 named: Vite 8.3.8, `@vitejs/plugin-react` 6.3.0, `@tailwindcss/vite` 4.3.5, `@adonisjs/core` 7.7.0 and `@adonisjs/assembler` 8.6.0 move with them.
- The `@adonisjs/inertia/vite` plugin is gone. `@adonisjs/vite` builds the SSR entry from `serverEntryPoints` into `public/assets/server/ssr.js`, with a manifest the runtime reads. The 6.0.4 types spell the options `entryPoints` and `serverEntryPoints`, unlike the 5.0.0 release notes.
- Inertia 3.11.0's resolver type takes the component (its runtime still accepts a module). The adapter's `resolvePageComponent` returns the module, so the resolver returns its `default` to satisfy the type. The root layout, attached as a one-argument function, still renders: Inertia 3 calls it as a layout resolver and, because it returns an element, wraps the page with it.
- The page object is now in `<script data-page="app" type="application/json">`, not a `data-page` attribute. The page's only executable script is the external bundle.
- No code used the Inertia 3 breaking changes: the renamed events, `router.cancel()`, the progress-bar exports or Axios.

## Decision

1. **Use `@adonisjs/inertia` 5 with `@inertiajs/react` 3 and `@adonisjs/vite` 6**, with the peers they require: Vite 8, `@vitejs/plugin-react` 6, `@adonisjs/core` 7.7 and `@adonisjs/assembler` 8.6. The spike met every pass criterion of OD-25 and 09 §10.5:
   - the SSR bundle builds, and a production build booted in a staging-shaped environment renders the 404 page on the server, which React then hydrates with no console error;
   - the Tuyau client compiles against the generated registry, and its provider renders on the server and in the browser;
   - every existing page renders: the error pages, and the development gallery, which hydrates with no error;
   - the unit, functional and concurrency suites pass (869 tests), and CI must be green on the pull request before it merges;
   - the CSP check of 09 §10.5: the page object is a JSON data block, which a browser never executes, so it needs no nonce under [07 §7.3](../07-security-threat-model-and-permissions.md#73-csp-and-security-headers), and no inline executable script remains.
2. **SSR is configured in two places that must agree**: `ssr.entrypoint` in `config/inertia.ts` and `serverEntryPoints` in `vite.config.ts`. The production boot check (`start/boot_checks.ts`) reads `public/assets/server/.vite/manifest.json` from the working directory, as `@adonisjs/vite` does, and refuses to boot unless it has an entry for `ssr.entrypoint` whose bundle exists; the Dockerfile, CI's build step and the image check (`T-OPS-010`) look for the manifest.
3. **Examples follow adapter 5 and Inertia 3** from now on. 08 and 09 drop their 4.2.0 marks; the 2026-09 research and audit records keep theirs as history.

## Alternatives considered

- **Stay on 4.2.0 and Inertia 2 until after R1** (OD-25 option (b)). It avoids the larger dependency move, but every page of M1 to M7 would be written to the legacy line and moved again, and the AdonisJS documentation would not match the code (R-22).
- **Upgrade only the three named packages.** Not possible: `@adonisjs/vite` 6 requires Vite 8 and core 7.5 or later.

## Consequences

- One coordinated move instead of a later rewrite: M1 to M7 build on the current Inertia line and can use its server APIs (`once()`, `scroll()`, rescued deferred props, `flash()`).
- The upgrade also moved Vite and `@adonisjs/core` by a major and a minor version. The full test suite and the production checks cover them; anything they miss shows up in E10, which builds on this.
- The production SSR bundle moved to `public/assets/server/`. Any script or document that names `ssr/ssr.js` is outdated.
- pnpm's one-day release-age gate ([09 §10.2](../09-code-structure-and-engineering-standards.md#102-lockfile-version-ranges-and-install-behaviour)) kept the spike on adapter 5.0.5, because 5.0.6 was one day old; a later update picks it up.

## When to revisit

- Inertia 4 or `@adonisjs/inertia` 6 is released.
- E10's SSR work (RF-08) or E11's CSP finds a problem in the page payload or the bundle path.
- `@adonisjs/inertia`'s `resolvePageComponent` or Inertia's resolver type changes, so the resolvers in `inertia/app.tsx` and `inertia/ssr.tsx` can return the helper's result directly.

## Verification

- The full test suite passes on the upgraded stack, including `T-ARCH-025` (server rendering writes nothing to the console), which now also skips Vite 8's time-prefixed status line, so it passes run alone.
- `T-OPS-010` and CI's production build step check the SSR manifest at its new path; `start/boot_checks.ts` refuses a production boot without it, or without the `ssr.entrypoint` entry or its bundle (`T-ARCH-024`'s unit cases; a production boot with the manifest hidden was refused).
- The hydration check of the production 404 page and of the development gallery: the `dripnepal-run` skill's page check and a script that confirms React's root on `#app`, with the results in the pull request's description.

## Related

- [risks: OD-25, R-22](../risks-and-open-decisions.md#22-decision-table)
- [09 §10.5](../09-code-structure-and-engineering-standards.md#105-the-inertia-v5-upgrade-od-25), [12 §4.1](../12-roadmap-and-backlog.md#41-epics-and-order) (E1, E10)
- [ADR-0003](0003-inertia-ssr-storefront-csr-dashboards.md), [ADR-0004](0004-inertia-reads-json-api-writes.md)
