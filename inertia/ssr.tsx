import { client } from '~/client'
import { StrictMode, type ReactElement } from 'react'
import { type Data } from '@generated/data'
import ReactDOMServer from 'react-dom/server'
import { createInertiaApp, type usePage } from '@inertiajs/react'
import { TuyauProvider } from '@adonisjs/inertia/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import RootLayout from '~/layouts/root_layout'

const appName = import.meta.env.VITE_APP_NAME || 'Drip Nepal'

// The page object Inertia hands the SSR entry (the type usePage returns).
export default function render(page: ReturnType<typeof usePage>) {
  return createInertiaApp({
    page,
    title: (title) => (title ? `${title} - ${appName}` : appName),
    render: ReactDOMServer.renderToString,
    resolve: (name) => {
      return resolvePageComponent(
        `./pages/${name}.tsx`,
        import.meta.glob('./pages/**/*.tsx', { eager: true }),
        (resolvedPage: ReactElement<Data.SharedProps>) => <RootLayout children={resolvedPage} />
      )
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
