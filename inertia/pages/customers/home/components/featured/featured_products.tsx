import { ArrowRight } from 'lucide-react'
import { Link } from '@adonisjs/inertia/react'
import type { Data } from '@generated/data'
import { Button } from '~/components/ui/button'
import { CatalogProductCard } from '~/components/commerce/catalog_product_card'

type FeaturedProductsProps = {
  products: Data.ProductCard[]
}

/*
 * The newest products as a grid: two across on phones, so shoppers see
 * products without swiping a carousel.
 */
export function FeaturedProducts({ products }: FeaturedProductsProps) {
  return (
    <section
      aria-labelledby="new-arrivals-heading"
      className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-20"
    >
      <div className="mb-5 flex items-end justify-between gap-4 md:mb-8">
        <h2
          id="new-arrivals-heading"
          className="font-heading text-2xl font-bold tracking-tight md:text-4xl"
        >
          New arrivals
        </h2>
        <Link
          route="search"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Shop all <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-x-3 gap-y-7 md:grid-cols-4 md:gap-x-6 md:gap-y-10">
        {products.map((product) => (
          <li key={product.id}>
            <CatalogProductCard product={product} className="h-full" />
          </li>
        ))}
      </ul>

      <div className="mt-8 flex justify-center md:mt-12">
        <Button
          asChild
          variant="outline"
          size="lg"
          className="h-12 w-full rounded-xl sm:w-auto sm:px-10"
        >
          <Link route="search">See all products</Link>
        </Button>
      </div>
    </section>
  )
}
