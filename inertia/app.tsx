import './css/app.css'
import './css/style.css'
import { StrictMode, type ComponentType, type ReactElement } from 'react'
import { client } from './client'
import RootLayout from '~/layouts/root_layout'
import { type Data } from '@generated/data'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import { TuyauProvider } from '@adonisjs/inertia/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'

const appName = import.meta.env.VITE_APP_NAME || 'Drip Nepal'
createInertiaApp({
  title: (title) => (title ? `${title} - ${appName}` : appName),
  // Inertia 3 takes the component; the adapter's helper returns its module.
  resolve: async (name) => {
    const page = await resolvePageComponent(
      `./pages/${name}.tsx`,
      import.meta.glob<{ default: ComponentType }>('./pages/**/*.tsx'),
      (child: ReactElement<Data.SharedProps>) => <RootLayout children={child} />
    )
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

    // The server renders every page (config/inertia.ts), so React adopts
    // that HTML instead of throwing it away and painting again (RF-08).
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
  progress: {
    color: '#4B5563',
  },
})
