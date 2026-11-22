import './css/app.css'
import { StrictMode, type ComponentType } from 'react'
import { client } from './client'
import { layoutFor } from '~/layouts/layout_for'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import { TuyauProvider } from '@adonisjs/inertia/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'

const appName = import.meta.env.VITE_APP_NAME || 'Drip Nepal'

// The development pages (routed only outside production, RF-40) are not built
// into the production bundle: `vite build` replaces import.meta.env.DEV with
// false, so the first glob and its chunks drop out (docs/08 §10.1).
const pages = import.meta.env.DEV
  ? import.meta.glob<{ default: ComponentType }>('./pages/**/*.tsx')
  : import.meta.glob<{ default: ComponentType }>(['./pages/**/*.tsx', '!./pages/dev/**'])

createInertiaApp({
  title: (title) => (title ? `${title} - ${appName}` : appName),
  // Inertia 3.11's resolver type takes the component; the adapter's helper
  // returns its module.
  resolve: async (name) => {
    const page = await resolvePageComponent(`./pages/${name}.tsx`, pages, layoutFor(name))
    return page.default
  },
  setup({ el, App, props }) {
    // Must match the tree of inertia/ssr.tsx exactly: an extra element, even
    // one rendering nothing, changes React's generated ids (useId).
    const app = (
      <StrictMode>
        <TuyauProvider client={client}>
          <App {...props} />
        </TuyauProvider>
      </StrictMode>
    )

    // The server renders the SSR surfaces of config/inertia.ts: React adopts
    // that HTML instead of throwing it away and painting again (RF-08). Every
    // other page arrives empty and renders here.
    if (el.hasChildNodes()) {
      hydrateRoot(el, app)
    } else {
      createRoot(el).render(app)
    }

    // Devtools get their own root, in development only, so they never touch
    // the hydrated tree and are not in the production bundle (RF-30).
    if (import.meta.env.DEV) {
      const container = document.body.appendChild(document.createElement('div'))
      void import('./devtools').then(({ default: Devtools }) =>
        createRoot(container).render(<Devtools />)
      )
    }
  },
  // The bar's styles are in app.css, under style-src 'self': the injected <style> would need
  // the request's CSP nonce handed to the client config (docs/08 §8.1).
  progress: { includeCSS: false },
})
