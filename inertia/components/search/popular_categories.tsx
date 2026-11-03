import { Link } from '@adonisjs/inertia/react'

/*
 * A fixed shortcut list of storefront categories (slugs from the category
 * seed). Pages for categories without products show an empty state.
 */
const CATEGORIES = [
  { name: 'Streetwear', slug: 'streetwear' },
  { name: 'T-Shirts', slug: 't-shirts' },
  { name: 'Hoodies', slug: 'hoodies' },
  { name: 'Sneakers', slug: 'sneakers' },
  { name: 'Jackets', slug: 'jackets' },
  { name: 'Cargo Pants', slug: 'cargo-pants' },
  { name: 'Watches', slug: 'watches' },
  { name: 'Bags', slug: 'bags' },
  { name: 'Accessories', slug: 'accessories' },
  { name: 'Traditional Wear', slug: 'traditional-wear' },
  { name: 'Kurtas', slug: 'kurtas' },
  { name: 'Sarees', slug: 'sarees' },
]

type PopularCategoriesProps = {
  onNavigate: () => void
}

export function PopularCategories({ onNavigate }: PopularCategoriesProps) {
  return (
    <section aria-labelledby="search-categories-heading">
      <h3
        id="search-categories-heading"
        className="px-2 py-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase"
      >
        Browse categories
      </h3>
      <ul className="mt-1 flex flex-wrap gap-2 px-2">
        {CATEGORIES.map((category) => (
          <li key={category.slug}>
            <Link
              route="categories.show"
              routeParams={{ slug: category.slug }}
              onClick={onNavigate}
              className="inline-flex items-center rounded-full bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
