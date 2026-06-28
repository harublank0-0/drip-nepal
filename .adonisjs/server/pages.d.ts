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
    'design_system/color_card': ExtractProps<(typeof import('../../inertia/pages/design_system/color_card.tsx'))['default']>
    'design_system/colors': ExtractProps<(typeof import('../../inertia/pages/design_system/colors.ts'))['default']>
    'design_system/design_buttons': ExtractProps<(typeof import('../../inertia/pages/design_system/design_buttons.tsx'))['default']>
    'design_system/design_card': ExtractProps<(typeof import('../../inertia/pages/design_system/design_card.tsx'))['default']>
    'design_system/index': ExtractProps<(typeof import('../../inertia/pages/design_system/index.tsx'))['default']>
    'design_system/theme_section': ExtractProps<(typeof import('../../inertia/pages/design_system/theme_section.tsx'))['default']>
    'errors/not_found': ExtractProps<(typeof import('../../inertia/pages/errors/not_found.tsx'))['default']>
    'errors/server_error': ExtractProps<(typeof import('../../inertia/pages/errors/server_error.tsx'))['default']>
    'commerce/women': ExtractProps<(typeof import('../../inertia/pages/commerce/women.tsx'))['default']>
    'commerce/cart/index': ExtractProps<(typeof import('../../inertia/pages/commerce/cart/index.tsx'))['default']>
    'commerce/checkout/index': ExtractProps<(typeof import('../../inertia/pages/commerce/checkout/index.tsx'))['default']>
    'commerce/categories/mock': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/mock.ts'))['default']>
    'commerce/categories/show': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/show.tsx'))['default']>
    'commerce/men/index': ExtractProps<(typeof import('../../inertia/pages/commerce/men/index.tsx'))['default']>
    'commerce/product_detail/index': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/index.tsx'))['default']>
    'commerce/product_detail/mock': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/mock.ts'))['default']>
    'commerce/categories/components/applied_filters': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/components/applied_filters.tsx'))['default']>
    'commerce/categories/components/breadcrumb': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/components/breadcrumb.tsx'))['default']>
    'commerce/categories/components/category_hero': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/components/category_hero.tsx'))['default']>
    'commerce/categories/components/empty_state': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/components/empty_state.tsx'))['default']>
    'commerce/categories/components/filter_group': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/components/filter_group.tsx'))['default']>
    'commerce/categories/components/filter_sidebar': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/components/filter_sidebar.tsx'))['default']>
    'commerce/categories/components/mobile_filter_drawer': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/components/mobile_filter_drawer.tsx'))['default']>
    'commerce/categories/components/pagination': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/components/pagination.tsx'))['default']>
    'commerce/categories/components/quick_add_modal': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/components/quick_add_modal.tsx'))['default']>
    'commerce/categories/components/recently_viewed': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/components/recently_viewed.tsx'))['default']>
    'commerce/categories/components/recommended_products': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/components/recommended_products.tsx'))['default']>
    'commerce/categories/components/sort_dropdown': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/components/sort_dropdown.tsx'))['default']>
    'commerce/men/components/hero_section': ExtractProps<(typeof import('../../inertia/pages/commerce/men/components/hero_section.tsx'))['default']>
    'commerce/product_detail/components/product_description': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_description.tsx'))['default']>
    'commerce/product_detail/components/product_gallery': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_gallery.tsx'))['default']>
    'commerce/product_detail/components/product_info': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_info.tsx'))['default']>
    'commerce/product_detail/components/rating_summary': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/rating_summary.tsx'))['default']>
    'commerce/product_detail/components/recently_viewed': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/recently_viewed.tsx'))['default']>
    'commerce/product_detail/components/related_products': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/related_products.tsx'))['default']>
    'commerce/product_detail/components/review_card': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/review_card.tsx'))['default']>
    'commerce/product_detail/components/review_section': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/review_section.tsx'))['default']>
    'commerce/product_detail/components/store_card': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/store_card.tsx'))['default']>
    'commerce/product_detail/components/variant_selector': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/variant_selector.tsx'))['default']>
    'commerce/product_detail/hooks/useMousePosition': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/hooks/useMousePosition.ts'))['default']>
    'commerce/product_detail/components/color_variants/index': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/color_variants/index.tsx'))['default']>
    'commerce/men/components/mens_trending/index': ExtractProps<(typeof import('../../inertia/pages/commerce/men/components/mens_trending/index.tsx'))['default']>
    'commerce/product_detail/components/product_media_gallery/product_image_dialog': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_media_gallery/product_image_dialog.tsx'))['default']>
    'commerce/product_detail/components/product_media_gallery/index': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_media_gallery/index.tsx'))['default']>
    'commerce/product_detail/components/product_media_gallery/product_images_thumbnail': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_media_gallery/product_images_thumbnail.tsx'))['default']>
    'commerce/product_detail/components/product_media_gallery/product_main_image': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_media_gallery/product_main_image.tsx'))['default']>
    'home/index': ExtractProps<(typeof import('../../inertia/pages/home/index.tsx'))['default']>
    'home/components/categories/category_cards': ExtractProps<(typeof import('../../inertia/pages/home/components/categories/category_cards.tsx'))['default']>
    'home/components/featured/featured_products': ExtractProps<(typeof import('../../inertia/pages/home/components/featured/featured_products.tsx'))['default']>
    'home/components/featured/featured_stores': ExtractProps<(typeof import('../../inertia/pages/home/components/featured/featured_stores.tsx'))['default']>
    'home/components/hero/hero_panel': ExtractProps<(typeof import('../../inertia/pages/home/components/hero/hero_panel.tsx'))['default']>
    'home/components/hero/index': ExtractProps<(typeof import('../../inertia/pages/home/components/hero/index.tsx'))['default']>
    'shops/register/form': ExtractProps<(typeof import('../../inertia/pages/shops/register/form.ts'))['default']>
    'shops/register/index': ExtractProps<(typeof import('../../inertia/pages/shops/register/index.tsx'))['default']>
  }
}
