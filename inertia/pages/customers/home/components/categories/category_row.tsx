import { useState } from 'react'
import { Link } from '@adonisjs/inertia/react'
import { ArrowRight, ImageIcon } from 'lucide-react'

export type HomeCategory = {
  name: string
  slug: string
  image: string | null
  productCount: number
}

/*
 * The category picture, or a placeholder when there is none or it fails
 * to load.
 */
function TileImage({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <ImageIcon
        className="absolute top-1/2 left-1/2 size-8 -translate-1/2 text-muted-foreground/40"
        aria-hidden="true"
      />
    )
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
    />
  )
}

/*
 * The categories that have products. A row you swipe through on phones,
 * a grid on larger screens.
 */
export function CategoryRow({ categories }: { categories: HomeCategory[] }) {
  return (
    <section aria-labelledby="categories-heading" className="mx-auto max-w-7xl py-10 md:py-20">
      <div className="mb-5 flex items-end justify-between gap-4 px-5 md:mb-8 md:px-8">
        <h2
          id="categories-heading"
          className="font-heading text-2xl font-bold tracking-tight md:text-4xl"
        >
          Shop by category
        </h2>
        <Link
          route="search"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Shop all <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-2 [scrollbar-width:none] md:grid md:grid-cols-4 md:gap-5 md:overflow-visible md:px-8 [&::-webkit-scrollbar]:hidden">
        {categories.map((category) => (
          <li key={category.slug} className="w-[40%] shrink-0 snap-start sm:w-[28%] md:w-auto">
            <Link
              route="categories.show"
              routeParams={{ slug: category.slug }}
              className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <TileImage src={category.image} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3 md:p-5">
                <h3 className="font-heading text-lg leading-tight font-bold text-white md:text-2xl">
                  {category.name}
                </h3>
                <p className="mt-0.5 text-xs text-white/70 md:text-sm">
                  {category.productCount} {category.productCount === 1 ? 'item' : 'items'}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
