import { ErrorScreen } from '~/components/errors/error_screen'
import { Button } from '~/components/ui/button'
import { t } from '~/lib/i18n'

/*
 * 500–599 (docs/08 §8.3): an apology, a retry of the same URL and the
 * request ID support asks for. The handler passes only `request_id`, so no
 * error detail can reach this page (RF-36).
 */
export default function ServerError({ request_id }: { request_id: string | null }) {
  return (
    <ErrorScreen title={t('errors.server_error.title')} heading={t('errors.server_error.heading')}>
      <p className="text-muted-foreground">{t('errors.server_error.body')}</p>
      <Button className="self-start" onClick={() => window.location.reload()}>
        {t('errors.server_error.retry')}
      </Button>
      {request_id ? (
        <p className="text-sm text-muted-foreground">
          {t('errors.server_error.reference')}{' '}
          <code className="font-mono select-all">{request_id}</code>
        </p>
      ) : null}
    </ErrorScreen>
  )
}
