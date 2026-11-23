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
    'account/addresses': ExtractProps<(typeof import('../../inertia/pages/account/addresses.tsx'))['default']>
    'account/overview': ExtractProps<(typeof import('../../inertia/pages/account/overview.tsx'))['default']>
    'account/security': ExtractProps<(typeof import('../../inertia/pages/account/security.tsx'))['default']>
    'admin/forbidden': ExtractProps<(typeof import('../../inertia/pages/admin/forbidden.tsx'))['default']>
    'admin/logistics': ExtractProps<(typeof import('../../inertia/pages/admin/logistics.tsx'))['default']>
    'auth/forgot_password': ExtractProps<(typeof import('../../inertia/pages/auth/forgot_password.tsx'))['default']>
    'auth/login': ExtractProps<(typeof import('../../inertia/pages/auth/login.tsx'))['default']>
    'auth/mfa': ExtractProps<(typeof import('../../inertia/pages/auth/mfa.tsx'))['default']>
    'auth/reset_password': ExtractProps<(typeof import('../../inertia/pages/auth/reset_password.tsx'))['default']>
    'auth/signup': ExtractProps<(typeof import('../../inertia/pages/auth/signup.tsx'))['default']>
    'auth/verify_email': ExtractProps<(typeof import('../../inertia/pages/auth/verify_email.tsx'))['default']>
    'dev/design_system/color_card': ExtractProps<(typeof import('../../inertia/pages/dev/design_system/color_card.tsx'))['default']>
    'dev/design_system/colors': ExtractProps<(typeof import('../../inertia/pages/dev/design_system/colors.ts'))['default']>
    'dev/design_system/design_buttons': ExtractProps<(typeof import('../../inertia/pages/dev/design_system/design_buttons.tsx'))['default']>
    'dev/design_system/design_card': ExtractProps<(typeof import('../../inertia/pages/dev/design_system/design_card.tsx'))['default']>
    'dev/design_system/index': ExtractProps<(typeof import('../../inertia/pages/dev/design_system/index.tsx'))['default']>
    'dev/design_system/theme_section': ExtractProps<(typeof import('../../inertia/pages/dev/design_system/theme_section.tsx'))['default']>
    'dev/overlays': ExtractProps<(typeof import('../../inertia/pages/dev/overlays.tsx'))['default']>
    'dev/sign_in': ExtractProps<(typeof import('../../inertia/pages/dev/sign_in.tsx'))['default']>
    'errors/forbidden': ExtractProps<(typeof import('../../inertia/pages/errors/forbidden.tsx'))['default']>
    'errors/not_found': ExtractProps<(typeof import('../../inertia/pages/errors/not_found.tsx'))['default']>
    'errors/server_error': ExtractProps<(typeof import('../../inertia/pages/errors/server_error.tsx'))['default']>
    'seller/overview': ExtractProps<(typeof import('../../inertia/pages/seller/overview.tsx'))['default']>
    'seller/settings': ExtractProps<(typeof import('../../inertia/pages/seller/settings.tsx'))['default']>
    'seller/shipping': ExtractProps<(typeof import('../../inertia/pages/seller/shipping.tsx'))['default']>
    'storefront/home': ExtractProps<(typeof import('../../inertia/pages/storefront/home.tsx'))['default']>
    'storefront/legal_document': ExtractProps<(typeof import('../../inertia/pages/storefront/legal_document.tsx'))['default']>
  }
}
