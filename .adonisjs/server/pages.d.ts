import '@adonisjs/inertia/types'

import type React from 'react'
import type { Prettify } from '@adonisjs/core/types/common'

type ExtractProps<T> =
  T extends React.FC<infer Props>
    ? Prettify<Omit<Props, 'children'>>
    : T extends React.Component<infer Props>
      ? Prettify<Omit<Props, 'children'>>
      : never

declare module '@adonisjs/inertia/types' {
  export interface InertiaPages {
    'auth/login': ExtractProps<(typeof import('../../inertia/pages/auth/login.tsx'))['default']>
    'auth/signup': ExtractProps<(typeof import('../../inertia/pages/auth/signup.tsx'))['default']>
    'commerce/men': ExtractProps<(typeof import('../../inertia/pages/commerce/men.tsx'))['default']>
    'commerce/women': ExtractProps<(typeof import('../../inertia/pages/commerce/women.tsx'))['default']>
    'errors/not_found': ExtractProps<(typeof import('../../inertia/pages/errors/not_found.tsx'))['default']>
    'errors/server_error': ExtractProps<(typeof import('../../inertia/pages/errors/server_error.tsx'))['default']>
    'home/components/hero/hero_panel': ExtractProps<(typeof import('../../inertia/pages/home/components/hero/hero_panel.tsx'))['default']>
    'home/components/hero/index': ExtractProps<(typeof import('../../inertia/pages/home/components/hero/index.tsx'))['default']>
    'home/index': ExtractProps<(typeof import('../../inertia/pages/home/index.tsx'))['default']>
  }
}
