import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import CustomersLayout from '~/layouts/customers_layout'
import RootLayout from '~/layouts/root_layout'

/*
 * The production page for a server error (app/exceptions/handler.ts). It
 * keeps the shop's header and footer, where the contact details are, and
 * offers to try again (docs/08 §4.3).
 */

/*
 * After a failed form submit (a POST to /api/v1/…), the address bar shows
 * the API address, which has no page: go back to the form, which keeps
 * what was typed where the page remembers it (checkout). An API address
 * opened directly has nothing to go back to, so it is reloaded.
 */
function tryAgain() {
  if (window.location.pathname.startsWith('/api/') && window.history.length > 1) {
    window.history.back()
  } else {
    window.location.reload()
  }
}

export default function ServerError() {
  return (
    <>
      <Head title="Something went wrong" />
      <div className="flex flex-col items-center px-4 py-16 text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-muted">
          <TriangleAlertIcon className="size-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="font-heading text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          That was a problem on our side. Try again in a moment; if it keeps happening, contact us
          (details at the bottom of the page).
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Button size="lg" className="h-11 rounded-xl px-6" onClick={tryAgain}>
            <RefreshCwIcon className="size-4" aria-hidden="true" />
            Try again
          </Button>
          <Button size="lg" variant="outline" className="h-11 rounded-xl px-6" asChild>
            <Link route="home">Back to the shop</Link>
          </Button>
        </div>
      </div>
    </>
  )
}

ServerError.layout = [RootLayout, CustomersLayout]
