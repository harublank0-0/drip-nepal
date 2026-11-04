import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { PackageIcon, SearchXIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import CustomersLayout from '~/layouts/customers_layout'
import RootLayout from '~/layouts/root_layout'

/*
 * The production 404 page (app/exceptions/handler.ts). It keeps the shop's
 * header and footer, says why, and offers the next step (docs/08 §4.3).
 */
export default function NotFound() {
  return (
    <>
      <Head title="Page not found" />
      <div className="flex flex-col items-center px-4 py-16 text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-muted">
          <SearchXIcon className="size-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="font-heading text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          The link may be old, or the product is no longer for sale.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Button size="lg" className="h-11 rounded-xl px-6" asChild>
            <Link route="home">Back to the shop</Link>
          </Button>
          <Button size="lg" variant="outline" className="h-11 rounded-xl px-6" asChild>
            <Link route="orders.track">
              <PackageIcon className="size-4" aria-hidden="true" />
              Track an order
            </Link>
          </Button>
        </div>
      </div>
    </>
  )
}

NotFound.layout = [RootLayout, CustomersLayout]
