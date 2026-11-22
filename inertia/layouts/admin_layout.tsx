import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import type { Data } from '@generated/data'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/components/ui/sidebar'
import { AdminSidebar, ADMIN_NAV_ID } from '~/components/admin/admin_sidebar'
import { SkipLink } from '~/components/common/skip_link'
import { t } from '~/lib/i18n'

/*
 * The admin surface (docs/08 §2.6, §2.7, §6.3, §9.1). Below `md` the
 * sidebar is a sheet behind the menu button; from `md` it is shown, and the
 * menu button hides and shows it. The page is one `main` landmark (the
 * sidebar inset) with the skip links' target, holding a top bar and the
 * scrolling pane, which is Inertia's scroll region so Back restores its
 * position.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { props } = usePage<Data.SharedProps>()
  return (
    <SidebarProvider className="h-svh">
      <SkipLink href="#main">{t('admin.layout.skip_main')}</SkipLink>
      {/* The navigation is in the page only from `md`; below it, it is a closed sheet. */}
      <SkipLink href={`#${ADMIN_NAV_ID}`} className="max-md:hidden">
        {t('admin.layout.skip_navigation')}
      </SkipLink>
      <AdminSidebar permissions={props.current_staff?.permissions ?? []} />
      <SidebarInset id="main" tabIndex={-1} className="overflow-hidden outline-none">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
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
        </div>
        {/* eslint-disable-next-line react/no-unknown-property -- Inertia 3 restores scroll by the `scroll-region` attribute (docs/08 §6.3) */}
        <div scroll-region="" className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
