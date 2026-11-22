import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { t } from '~/lib/i18n'

/*
 * A 403 inside the member's or staff member's own scope (docs/08 §4.3, §8.5):
 * says the role doesn't include this, never which other tenant owns what.
 * Another tenant's resource is a plain 404 (docs/07 §4.1).
 */
export function PermissionDenied() {
  return (
    <Alert>
      <AlertTitle>{t('errors.forbidden.heading')}</AlertTitle>
      <AlertDescription>{t('errors.forbidden.body')}</AlertDescription>
    </Alert>
  )
}
