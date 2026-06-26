import './css/app.css'
import './css/style.css'
import { StrictMode, type ReactElement } from 'react'
import { client } from './client'
import Layout from '~/layouts/default'
import AuthLayout from '~/layouts/auth'
import { type Data } from '@generated/data'
import { createRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import { TuyauProvider } from '@adonisjs/inertia/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'

import { TanStackDevtools } from '@tanstack/react-devtools'
import { formDevtoolsPlugin } from '@tanstack/react-form-devtools'
import { Show } from '~/components/ui/show'

const appName = import.meta.env.VITE_APP_NAME || 'AdonisJS'
const isDevMode = import.meta.env.DEV

createInertiaApp({
  title: (title) => (title ? `${title} - ${appName}` : appName),
  resolve: (name) => {
    return resolvePageComponent(
      `./pages/${name}.tsx`,
      import.meta.glob('./pages/**/*.tsx'),
      (page: ReactElement<Data.SharedProps>) =>
        name.startsWith('auth/') ? (
          <AuthLayout children={page} />
        ) : (
          <Layout children={page} />
        )
    )
  },
  setup({ el, App, props }) {
    createRoot(el).render(
      <StrictMode>
        <TuyauProvider client={client}>
          <Show when={isDevMode}>
            <TanStackDevtools plugins={[formDevtoolsPlugin()]} />
          </Show>
          <App {...props} />
        </TuyauProvider>
      </StrictMode>
    )
  },
  progress: {
    color: '#4B5563',
  },
})
