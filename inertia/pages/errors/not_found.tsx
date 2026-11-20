import { ErrorScreen } from '~/components/errors/error_screen'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { t } from '~/lib/i18n'

/*
 * 404 (docs/08 §8.3): the same page for a missing resource and for one in
 * another shop's or customer's scope (docs/08 §8.5), so it says nothing
 * about which it was.
 */
export default function NotFound() {
  return (
    <ErrorScreen title={t('errors.not_found.title')} heading={t('errors.not_found.heading')}>
      <p className="text-muted-foreground">{t('errors.not_found.body')}</p>
      <form action="/search" method="get" role="search" className="flex gap-2">
        <label htmlFor="not-found-search" className="sr-only">
          {t('errors.not_found.search_label')}
        </label>
        <Input
          id="not-found-search"
          name="q"
          type="search"
          placeholder={t('errors.not_found.search_label')}
        />
        <Button type="submit">{t('errors.not_found.search_submit')}</Button>
      </form>
      <Button asChild variant="outline" className="self-start">
        <a href="/">{t('errors.not_found.home')}</a>
      </Button>
    </ErrorScreen>
  )
}
