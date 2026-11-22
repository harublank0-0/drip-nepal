import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import type { Data } from '@generated/data'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/components/ui/sidebar'
import { AdminSidebar } from '~/components/admin/admin_sidebar'
import { t } from '~/lib/i18n'

/*
 * The admin surface (docs/08 §2.6, §2.7, §6.3): a sidebar fixed from `lg`,
 * collapsible from `md` and a sheet behind the menu button below `md`; the
 * header names the signed-in staff member. The main pane is Inertia's
 * scroll region, so Back restores its position.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { props } = usePage<Data.SharedProps>()
  return (
    <SidebarProvider>
      <AdminSidebar permissions={props.current_staff?.permissions ?? []} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          {/* The sidebar names the surface from `md`; below it the sidebar is a sheet. */}
          <span className="font-semibold whitespace-nowrap md:hidden">
            {t('admin.layout.brand')}
          </span>
          {props.user && (
            <span className="text-muted-foreground ms-auto truncate text-sm">
              {t('admin.layout.signed_in_as', { email: props.user.email })}
            </span>
          )}
        </header>
        {/* eslint-disable-next-line react/no-unknown-property -- Inertia 3 restores scroll by the `scroll-region` attribute (docs/08 §6.3) */}
        <main scroll-region="" className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
