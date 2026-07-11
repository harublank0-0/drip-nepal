import type { ReactNode } from 'react'
import { PageHeader } from './components/page-header'
import { ShopSidebar, MobileShopNav } from './components/shop-sidebar'
import { StickySaveBar } from './components/sticky-save-bar'
import { ShopManagementProvider, useShopManagementContext } from './shop-management-provider'

function ShopManagementInner({ children }: { children: ReactNode }) {
  const { draft, isDirty, isSaving, discard, save } = useShopManagementContext()

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader
        storeSlug={draft.information.storeSlug}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={save}
      />

      <MobileShopNav />

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <ShopSidebar />

        <main className="flex min-w-0 flex-1 flex-col gap-6">{children}</main>
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

export function ShopManagementLayout({ children }: { children: ReactNode }) {
  return (
    <ShopManagementProvider>
      <ShopManagementInner>{children}</ShopManagementInner>
    </ShopManagementProvider>
  )
}
