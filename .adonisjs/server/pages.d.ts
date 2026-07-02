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
    'commerce/cart/index': ExtractProps<(typeof import('../../inertia/pages/commerce/cart/index.tsx'))['default']>
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
    'commerce/categories/mock': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/mock.ts'))['default']>
    'commerce/categories/show': ExtractProps<(typeof import('../../inertia/pages/commerce/categories/show.tsx'))['default']>
    'commerce/checkout/index': ExtractProps<(typeof import('../../inertia/pages/commerce/checkout/index.tsx'))['default']>
    'commerce/men/components/hero_section': ExtractProps<(typeof import('../../inertia/pages/commerce/men/components/hero_section.tsx'))['default']>
    'commerce/men/components/mens_trending/index': ExtractProps<(typeof import('../../inertia/pages/commerce/men/components/mens_trending/index.tsx'))['default']>
    'commerce/men/index': ExtractProps<(typeof import('../../inertia/pages/commerce/men/index.tsx'))['default']>
    'commerce/product_detail/components/color_variants/index': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/color_variants/index.tsx'))['default']>
    'commerce/product_detail/components/product_description': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_description.tsx'))['default']>
    'commerce/product_detail/components/product_gallery': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_gallery.tsx'))['default']>
    'commerce/product_detail/components/product_info': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_info.tsx'))['default']>
    'commerce/product_detail/components/product_media_gallery/index': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_media_gallery/index.tsx'))['default']>
    'commerce/product_detail/components/product_media_gallery/product_image_dialog': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_media_gallery/product_image_dialog.tsx'))['default']>
    'commerce/product_detail/components/product_media_gallery/product_images_thumbnail': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_media_gallery/product_images_thumbnail.tsx'))['default']>
    'commerce/product_detail/components/product_media_gallery/product_main_image': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/product_media_gallery/product_main_image.tsx'))['default']>
    'commerce/product_detail/components/rating_summary': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/rating_summary.tsx'))['default']>
    'commerce/product_detail/components/recently_viewed': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/recently_viewed.tsx'))['default']>
    'commerce/product_detail/components/related_products': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/related_products.tsx'))['default']>
    'commerce/product_detail/components/review_card': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/review_card.tsx'))['default']>
    'commerce/product_detail/components/review_section': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/review_section.tsx'))['default']>
    'commerce/product_detail/components/store_card': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/store_card.tsx'))['default']>
    'commerce/product_detail/components/variant_selector': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/components/variant_selector.tsx'))['default']>
    'commerce/product_detail/hooks/use_mouse_position': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/hooks/use_mouse_position.ts'))['default']>
    'commerce/product_detail/index': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/index.tsx'))['default']>
    'commerce/product_detail/mock': ExtractProps<(typeof import('../../inertia/pages/commerce/product_detail/mock.ts'))['default']>
    'commerce/women': ExtractProps<(typeof import('../../inertia/pages/commerce/women.tsx'))['default']>
    'customers/home/components/categories/category_cards': ExtractProps<(typeof import('../../inertia/pages/customers/home/components/categories/category_cards.tsx'))['default']>
    'customers/home/components/featured/featured_products': ExtractProps<(typeof import('../../inertia/pages/customers/home/components/featured/featured_products.tsx'))['default']>
    'customers/home/components/featured/featured_stores': ExtractProps<(typeof import('../../inertia/pages/customers/home/components/featured/featured_stores.tsx'))['default']>
    'customers/home/components/hero/hero_panel': ExtractProps<(typeof import('../../inertia/pages/customers/home/components/hero/hero_panel.tsx'))['default']>
    'customers/home/components/hero/index': ExtractProps<(typeof import('../../inertia/pages/customers/home/components/hero/index.tsx'))['default']>
    'customers/home/index': ExtractProps<(typeof import('../../inertia/pages/customers/home/index.tsx'))['default']>
    'design_system/color_card': ExtractProps<(typeof import('../../inertia/pages/design_system/color_card.tsx'))['default']>
    'design_system/colors': ExtractProps<(typeof import('../../inertia/pages/design_system/colors.ts'))['default']>
    'design_system/design_buttons': ExtractProps<(typeof import('../../inertia/pages/design_system/design_buttons.tsx'))['default']>
    'design_system/design_card': ExtractProps<(typeof import('../../inertia/pages/design_system/design_card.tsx'))['default']>
    'design_system/index': ExtractProps<(typeof import('../../inertia/pages/design_system/index.tsx'))['default']>
    'design_system/theme_section': ExtractProps<(typeof import('../../inertia/pages/design_system/theme_section.tsx'))['default']>
    'errors/not_found': ExtractProps<(typeof import('../../inertia/pages/errors/not_found.tsx'))['default']>
    'errors/server_error': ExtractProps<(typeof import('../../inertia/pages/errors/server_error.tsx'))['default']>
    'landing/components/AnimatedCounter': ExtractProps<(typeof import('../../inertia/pages/landing/components/AnimatedCounter.tsx'))['default']>
    'landing/components/BackgroundEffects': ExtractProps<(typeof import('../../inertia/pages/landing/components/BackgroundEffects.tsx'))['default']>
    'landing/components/BenefitsSection': ExtractProps<(typeof import('../../inertia/pages/landing/components/BenefitsSection.tsx'))['default']>
    'landing/components/CommandPalette': ExtractProps<(typeof import('../../inertia/pages/landing/components/CommandPalette.tsx'))['default']>
    'landing/components/CTASection': ExtractProps<(typeof import('../../inertia/pages/landing/components/CTASection.tsx'))['default']>
    'landing/components/CursorGlow': ExtractProps<(typeof import('../../inertia/pages/landing/components/CursorGlow.tsx'))['default']>
    'landing/components/DashboardMockup': ExtractProps<(typeof import('../../inertia/pages/landing/components/DashboardMockup.tsx'))['default']>
    'landing/components/DashboardPreview': ExtractProps<(typeof import('../../inertia/pages/landing/components/DashboardPreview.tsx'))['default']>
    'landing/components/FAQ': ExtractProps<(typeof import('../../inertia/pages/landing/components/FAQ.tsx'))['default']>
    'landing/components/FeaturesSection': ExtractProps<(typeof import('../../inertia/pages/landing/components/FeaturesSection.tsx'))['default']>
    'landing/components/Footer': ExtractProps<(typeof import('../../inertia/pages/landing/components/Footer.tsx'))['default']>
    'landing/components/HeroSection': ExtractProps<(typeof import('../../inertia/pages/landing/components/HeroSection.tsx'))['default']>
    'landing/components/PricingSection': ExtractProps<(typeof import('../../inertia/pages/landing/components/PricingSection.tsx'))['default']>
    'landing/components/ScrollProgress': ExtractProps<(typeof import('../../inertia/pages/landing/components/ScrollProgress.tsx'))['default']>
    'landing/components/StatisticsSection': ExtractProps<(typeof import('../../inertia/pages/landing/components/StatisticsSection.tsx'))['default']>
    'landing/components/Testimonials': ExtractProps<(typeof import('../../inertia/pages/landing/components/Testimonials.tsx'))['default']>
    'landing/components/TrustedBy': ExtractProps<(typeof import('../../inertia/pages/landing/components/TrustedBy.tsx'))['default']>
    'shops/dashboard/index': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/index.tsx'))['default']>
    'shops/dashboard/shop_management/components/analytics_summary': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/analytics_summary.tsx'))['default']>
    'shops/dashboard/shop_management/components/branding_settings': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/branding_settings.tsx'))['default']>
    'shops/dashboard/shop_management/components/business_hours': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/business_hours.tsx'))['default']>
    'shops/dashboard/shop_management/components/danger_zone': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/danger_zone.tsx'))['default']>
    'shops/dashboard/shop_management/components/notification_settings': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/notification_settings.tsx'))['default']>
    'shops/dashboard/shop_management/components/onboarding_empty_state': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/onboarding_empty_state.tsx'))['default']>
    'shops/dashboard/shop_management/components/page_header': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/page_header.tsx'))['default']>
    'shops/dashboard/shop_management/components/payment_settings': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/payment_settings.tsx'))['default']>
    'shops/dashboard/shop_management/components/performance_insights': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/performance_insights.tsx'))['default']>
    'shops/dashboard/shop_management/components/policies_section': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/policies_section.tsx'))['default']>
    'shops/dashboard/shop_management/components/section_nav': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/section_nav.tsx'))['default']>
    'shops/dashboard/shop_management/components/security_settings': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/security_settings.tsx'))['default']>
    'shops/dashboard/shop_management/components/seo_settings': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/seo_settings.tsx'))['default']>
    'shops/dashboard/shop_management/components/shared/auto_save_indicator': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/shared/auto_save_indicator.tsx'))['default']>
    'shops/dashboard/shop_management/components/shared/color_input': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/shared/color_input.tsx'))['default']>
    'shops/dashboard/shop_management/components/shared/confirm_dialog': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/shared/confirm_dialog.tsx'))['default']>
    'shops/dashboard/shop_management/components/shared/image_upload': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/shared/image_upload.tsx'))['default']>
    'shops/dashboard/shop_management/components/shared/policy_editor': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/shared/policy_editor.tsx'))['default']>
    'shops/dashboard/shop_management/components/shared/section_card': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/shared/section_card.tsx'))['default']>
    'shops/dashboard/shop_management/components/shared/sparkline': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/shared/sparkline.tsx'))['default']>
    'shops/dashboard/shop_management/components/shared/stat_card': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/shared/stat_card.tsx'))['default']>
    'shops/dashboard/shop_management/components/shipping_settings': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/shipping_settings.tsx'))['default']>
    'shops/dashboard/shop_management/components/shop_information_form': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/shop_information_form.tsx'))['default']>
    'shops/dashboard/shop_management/components/shop_overview_card': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/shop_overview_card.tsx'))['default']>
    'shops/dashboard/shop_management/components/social_links': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/social_links.tsx'))['default']>
    'shops/dashboard/shop_management/components/sticky_save_bar': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/components/sticky_save_bar.tsx'))['default']>
    'shops/dashboard/shop_management/constants': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/constants.ts'))['default']>
    'shops/dashboard/shop_management/format': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/format.ts'))['default']>
    'shops/dashboard/shop_management/mock_data': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/mock_data.ts'))['default']>
    'shops/dashboard/shop_management/types': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/types.ts'))['default']>
    'shops/dashboard/shop_management/use_section_form': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/use_section_form.ts'))['default']>
    'shops/dashboard/shop_management/use_shop_management': ExtractProps<(typeof import('../../inertia/pages/shops/dashboard/shop_management/use_shop_management.ts'))['default']>
    'shops/register/components/branding_panel': ExtractProps<(typeof import('../../inertia/pages/shops/register/components/branding_panel.tsx'))['default']>
    'shops/register/components/password_strength': ExtractProps<(typeof import('../../inertia/pages/shops/register/components/password_strength.tsx'))['default']>
    'shops/register/components/progress_stepper': ExtractProps<(typeof import('../../inertia/pages/shops/register/components/progress_stepper.tsx'))['default']>
    'shops/register/components/slug_input': ExtractProps<(typeof import('../../inertia/pages/shops/register/components/slug_input.tsx'))['default']>
    'shops/register/components/step_account': ExtractProps<(typeof import('../../inertia/pages/shops/register/components/step_account.tsx'))['default']>
    'shops/register/components/step_shop_info': ExtractProps<(typeof import('../../inertia/pages/shops/register/components/step_shop_info.tsx'))['default']>
    'shops/register/components/success_screen': ExtractProps<(typeof import('../../inertia/pages/shops/register/components/success_screen.tsx'))['default']>
    'shops/register/form': ExtractProps<(typeof import('../../inertia/pages/shops/register/form.ts'))['default']>
    'shops/register/index': ExtractProps<(typeof import('../../inertia/pages/shops/register/index.tsx'))['default']>
  }
}
