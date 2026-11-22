import { ErrorScreen } from '~/components/errors/error_screen'
import { Button } from '~/components/ui/button'
import { t } from '~/lib/i18n'

/*
 * 403 (docs/08 §8.5, `PermissionDenied`): a signed-in member or staff
 * member without the permission for a page in their own scope. Another
 * tenant's resource is a 404, never this page (docs/07 §4.1).
 */
export default function Forbidden() {
  return (
    <ErrorScreen title={t('errors.forbidden.title')} heading={t('errors.forbidden.heading')}>
      <p className="text-muted-foreground">{t('errors.forbidden.body')}</p>
      <Button asChild variant="outline" className="self-start">
        <a href="/">{t('errors.forbidden.back')}</a>
      </Button>
    </ErrorScreen>
  )
}
