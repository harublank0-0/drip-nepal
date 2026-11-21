import { defineConfig } from '@adonisjs/inertia'

export const SSR_SURFACES = ['storefront/', 'auth/', 'payments/', 'errors/'] as const

/*
 * The signed-in surfaces whose pages render with Inertia's `encryptHistory`
 * (docs/07 §3.11, RF-34), so the back button on a shared phone cannot show
 * the previous user's pages once their history key is cleared: Account
 * (`/account`, `/sell`, `/invitations`, docs/03 §6.1), Seller, Admin and
 * Checkout. Storefront pages are not encrypted. History encryption needs a
 * secure context: HTTPS, or a loopback origin such as http://localhost.
 */
export const ENCRYPTED_HISTORY_SURFACES = [
  '/account',
  '/sell',
  '/invitations',
  '/seller',
  '/admin',
  '/checkout',
] as const

/** Whether a request path belongs to a surface: a whole first segment, so `/accounts` does not. */
export const encryptsHistory = (path: string) =>
  ENCRYPTED_HISTORY_SURFACES.some((surface) => path === surface || path.startsWith(`${surface}/`))

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
