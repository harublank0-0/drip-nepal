import { Head } from '@inertiajs/react'
import { PermissionDenied } from '~/components/common/permission_denied'
import { t } from '~/lib/i18n'

/*
 * 403 on an admin page (docs/08 §8.5): `PermissionDenied` inside the admin
 * layout, whose navigation shows what the staff member's role can use.
 */
export default function AdminForbidden() {
  return (
    <>
      <Head title={t('errors.forbidden.title')} />
      <div className="max-w-prose space-y-4">
        <h1 className="text-2xl font-semibold">{t('errors.forbidden.title')}</h1>
        <PermissionDenied />
      </div>
    </>
  )
}
