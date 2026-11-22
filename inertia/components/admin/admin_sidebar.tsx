import { usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { urlFor } from '~/client'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '~/components/ui/sidebar'
import { t } from '~/lib/i18n'

/*
 * The admin navigation (docs/08 §2.7): groups Queues, Records and Platform,
 * each link shown only when the staff member's role holds its permission.
 * The UI hides; the server decides (docs/08 §11.6). Only built pages are
 * listed; the others join with their pages. Links come from route names
 * through the typed client (docs/08 §2.1).
 */
type NavItem = { route: 'admin.logistics'; label: Parameters<typeof t>[0]; permission: string }
type NavGroup = { label: Parameters<typeof t>[0]; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    label: 'admin.nav.platform',
    items: [
      {
        route: 'admin.logistics',
        label: 'admin.nav.courier_accounts',
        permission: 'platform.logistics.manage',
      },
    ],
  },
]

export function AdminSidebar({ permissions }: { permissions: string[] }) {
  const { url } = usePage()
  const path = url.split('?')[0]
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => permissions.includes(item.permission)),
  })).filter((group) => group.items.length > 0)

  return (
    <Sidebar aria-label={t('admin.layout.navigation')}>
      <SidebarHeader className="px-4 py-3 font-semibold">{t('admin.layout.brand')}</SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{t(group.label)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const href = urlFor(item.route)
                  const current = path === href
                  return (
                    <SidebarMenuItem key={item.route}>
                      <SidebarMenuButton asChild isActive={current}>
                        <Link route={item.route} aria-current={current ? 'page' : undefined}>
                          {t(item.label)}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
