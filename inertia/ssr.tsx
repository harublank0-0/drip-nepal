import { client } from '~/client'
import { StrictMode, type ReactElement } from 'react'
import { type Data } from '@generated/data'
import ReactDOMServer from 'react-dom/server'
import { createInertiaApp } from '@inertiajs/react'
import { TuyauProvider } from '@adonisjs/inertia/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import RootLayout from '~/layouts/root_layout'

export default function render(page: any) {
  return createInertiaApp({
    page,
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
