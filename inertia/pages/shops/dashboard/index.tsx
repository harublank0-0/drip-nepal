import { useState } from 'react'
import type { InertiaProps } from '~/types'
import { PageHeader } from './shop_management/components/page_header'
import { SectionNav, MobileSectionNav } from './shop_management/components/section_nav'
import { StickySaveBar } from './shop_management/components/sticky_save_bar'
import { ShopOverviewCard } from './shop_management/components/shop_overview_card'
import { ShopInformationForm } from './shop_management/components/shop_information_form'
import { BrandingSettings } from './shop_management/components/branding_settings'
import { BusinessHours } from './shop_management/components/business_hours'
import { ShippingSettings } from './shop_management/components/shipping_settings'
import { PaymentSettings } from './shop_management/components/payment_settings'
import { NotificationSettings } from './shop_management/components/notification_settings'
import { PoliciesSection } from './shop_management/components/policies_section'
import { SeoSettings } from './shop_management/components/seo_settings'
import { SocialLinks } from './shop_management/components/social_links'
import { AnalyticsSummary } from './shop_management/components/analytics_summary'
import { PerformanceInsights } from './shop_management/components/performance_insights'
import { SecuritySettings } from './shop_management/components/security_settings'
import { DangerZone } from './shop_management/components/danger_zone'
import { OnboardingEmptyState } from './shop_management/components/onboarding_empty_state'
import { useShopManagement } from './shop_management/use_shop_management'
import { createMockShopData } from './shop_management/mock_data'

type ShopDashboardPageProps = InertiaProps<{
  isNewVendor?: boolean
}>

export default function ShopDashboardPage({ isNewVendor = false }: ShopDashboardPageProps) {
  const [data] = useState(createMockShopData)
  const [setupComplete, setSetupComplete] = useState(!isNewVendor)
  const { draft, isDirty, isSaving, setSection, discard, save } = useShopManagement(data)

  if (!setupComplete) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center">
        <OnboardingEmptyState onComplete={() => setSetupComplete(true)} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader
        storeSlug={draft.information.storeSlug}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={save}
      />

      <MobileSectionNav />

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <SectionNav />

        <main className="flex min-w-0 flex-1 flex-col gap-6">
          <div id="overview" className="scroll-mt-24">
            <ShopOverviewCard
              overview={draft.overview}
              onEditLogo={() =>
                document.getElementById('branding')?.scrollIntoView({ behavior: 'smooth' })
              }
              onEditBanner={() =>
                document.getElementById('branding')?.scrollIntoView({ behavior: 'smooth' })
              }
            />
          </div>

          <ShopInformationForm
            value={draft.information}
            onChange={(next) => setSection('information', next)}
          />

          <BrandingSettings
            value={draft.branding}
            onChange={(next) => setSection('branding', next)}
          />

          <BusinessHours
            value={draft.businessHours}
            onChange={(next) => setSection('businessHours', next)}
          />

          <ShippingSettings
            value={draft.shipping}
            onChange={(next) => setSection('shipping', next)}
          />

          <PaymentSettings
            value={draft.payments}
            onChange={(next) => setSection('payments', next)}
          />

          <NotificationSettings
            value={draft.notifications}
            onChange={(next) => setSection('notifications', next)}
          />

          <PoliciesSection
            value={draft.policies}
            onChange={(next) => setSection('policies', next)}
          />

          <SeoSettings
            value={draft.seo}
            onChange={(next) => setSection('seo', next)}
            storeSlug={draft.information.storeSlug}
          />

          <SocialLinks value={draft.social} onChange={(next) => setSection('social', next)} />

          <AnalyticsSummary metrics={draft.analytics} />

          <PerformanceInsights insights={draft.insights} />

          <SecuritySettings
            value={draft.security}
            onChange={(next) => setSection('security', next)}
          />

          <DangerZone storeName={draft.information.storeName} />
        </main>
      </div>

      <StickySaveBar
        visible={isDirty}
        isSaving={isSaving}
        onDiscard={discard}
        onSave={save}
        onSaveAndPreview={async () => {
          const success = await save()
          if (success) {
            window.open(`/${draft.information.storeSlug}`, '_blank', 'noreferrer')
          }
        }}
      />
    </div>
  )
}
