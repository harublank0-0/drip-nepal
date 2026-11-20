import { defineConfig } from '@adonisjs/inertia'

export const SSR_SURFACES = ['storefront/', 'auth/', 'payments/', 'errors/'] as const

const inertiaConfig = defineConfig({
  /**
   * Server-side rendering options.
   */
  ssr: {
    /**
     * Toggle SSR mode for Inertia pages.
     */
    enabled: true,

    /**
     * Entry file used by the SSR server build.
     */
    entrypoint: 'inertia/ssr.tsx',
    /*
     * Server-rendered surfaces (docs/03 §6.1, ADR-0003): the storefront,
     * the sign-in pages, payment returns and the error pages, which every
     * surface can show. Seller, admin, account and development pages render
     * in the browser. inertia/ssr.tsx bundles the same folders
     * (docs/09 §13.8 rule 4).
     */
    pages: (_ctx, page) => SSR_SURFACES.some((surface) => page.startsWith(surface)),
  },
})

export default inertiaConfig
