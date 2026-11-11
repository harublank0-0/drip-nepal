import { ErrorScreen } from '~/components/errors/error_screen'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'

/*
 * 404 (docs/08 §8.3): the same page for a missing resource and for one in
 * another shop's or customer's scope (docs/08 §8.5), so it says nothing
 * about which it was.
 */
export default function NotFound() {
  return (
    <ErrorScreen title="Page not found" heading="We couldn't find that page">
      <p className="text-muted-foreground">
        The link may be broken, or the page may have been removed.
      </p>
      <form action="/search" method="get" role="search" className="flex gap-2">
        <label htmlFor="not-found-search" className="sr-only">
          Search products
        </label>
        <Input id="not-found-search" name="q" type="search" placeholder="Search products" />
        <Button type="submit">Search</Button>
      </form>
      <Button asChild variant="outline" className="self-start">
        <a href="/">Go to the home page</a>
      </Button>
    </ErrorScreen>
  )
}
