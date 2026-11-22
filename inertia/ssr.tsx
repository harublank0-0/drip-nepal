import { client } from '~/client'
import { StrictMode, type ComponentType } from 'react'
import ReactDOMServer from 'react-dom/server'
import { createInertiaApp, type usePage } from '@inertiajs/react'
import { TuyauProvider } from '@adonisjs/inertia/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { layoutFor } from '~/layouts/layout_for'

const appName = import.meta.env.VITE_APP_NAME || 'Drip Nepal'

// The page object Inertia hands the SSR entry (the type usePage returns).
export default function render(page: ReturnType<typeof usePage>) {
  return createInertiaApp({
    page,
    title: (title) => (title ? `${title} - ${appName}` : appName),
    render: ReactDOMServer.renderToString,
    // Inertia 3.11's resolver type takes the component; the adapter's helper
    // returns its module.
    resolve: async (name) => {
      const resolved = await resolvePageComponent(
        `./pages/${name}.tsx`,
        // Only the server-rendered surfaces of config/inertia.ts (docs/09 §13.8 rule 4).
        import.meta.glob<{ default: ComponentType }>(
          [
            './pages/storefront/**/*.tsx',
            './pages/auth/**/*.tsx',
            './pages/payments/**/*.tsx',
            './pages/errors/**/*.tsx',
          ],
          { eager: true }
        ),
        layoutFor(name)
      )
      return resolved.default
    },
    setup: ({ App, props }) => {
      return (
        <StrictMode>
          <TuyauProvider client={client}>
            <App {...props} />
          </TuyauProvider>
        </StrictMode>
      )
    },
  })
}
