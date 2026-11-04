import { useState, type SubmitEvent } from 'react'
import { router } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import type { Data } from '@generated/data'
import { ChevronRight, SearchIcon } from 'lucide-react'
import ManImage from '~/assets/hero-image/man.png'
import WomanImage from '~/assets/hero-image/woman.png'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { urlFor } from '~/client'
import { addRecentSearch } from '~/lib/recent_searches'
import { cn } from '~/lib/utils'
import type { ListingContext, ListingKind } from '../types'

const EYEBROW: Record<ListingKind, string> = {
  men: 'Shop',
  women: 'Shop',
  category: 'Category',
  search: 'Search',
  store: 'Store',
}

const countFormatter = new Intl.NumberFormat('en-IN')

/*
 * Unsplash originals are several MB; ask for a sized rendition instead.
 */
function sizedImage(url: string, width: number) {
  return url.startsWith('https://images.unsplash.com/') && !url.includes('?')
    ? `${url}?w=${width}&q=80&auto=format&fit=crop`
    : url
}

function headerImage(context: ListingContext) {
  switch (context.kind) {
    case 'men':
      return ManImage
    case 'women':
      return WomanImage
    case 'category':
      return context.category?.image ? sizedImage(context.category.image, 900) : null
    case 'store':
      return context.store?.banner ?? null
    default:
      return null
  }
}

function countLabel(total: number, hasFilters: boolean, kind: ListingKind) {
  if (total === 0) {
    if (hasFilters) return 'No products match your filters'
    return kind === 'search' ? 'No products found' : 'No products yet'
  }
  const noun = total === 1 ? 'product' : 'products'
  const suffix = hasFilters ? (total === 1 ? ' matches your filters' : ' match your filters') : ''
  return `${countFormatter.format(total)} ${noun}${suffix}`
}

function StoreMark({ store }: { store: Data.StoreCard }) {
  if (store.logo) {
    return (
      <img
        src={store.logo}
        alt=""
        className="size-12 rounded-full object-cover ring-1 ring-foreground/10 md:size-16"
      />
    )
  }
  return (
    <div
      aria-hidden="true"
      className="flex size-12 items-center justify-center rounded-full bg-primary font-heading text-xl font-bold text-primary-foreground md:size-16 md:text-2xl"
    >
      {store.name.charAt(0).toUpperCase()}
    </div>
  )
}

function SearchForm({ initialQuery }: { initialQuery: string }) {
  const [value, setValue] = useState(initialQuery)

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const q = value.trim()
    if (q) addRecentSearch(q)
    router.get(urlFor('search'), q ? { q } : {})
  }

  return (
    <form role="search" onSubmit={submit} className="flex w-full max-w-xl gap-2">
      <div className="relative flex-1">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search products, brands and stores"
          aria-label="Search products, brands and stores"
          className="h-11 pl-9"
        />
      </div>
      <Button type="submit" className="h-11 px-4">
        Search
      </Button>
    </form>
  )
}

type ListingHeaderProps = {
  context: ListingContext
  total: number
  hasFilters: boolean
}

export function ListingHeader({ context, total, hasFilters }: ListingHeaderProps) {
  const image = headerImage(context)
  const crumb = context.kind === 'search' ? 'Search' : context.title

  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className="mb-3 text-xs text-muted-foreground md:mb-4 md:text-sm"
      >
        <ol className="flex min-w-0 items-center gap-1.5">
          <li>
            <Link route="home" className="transition-colors hover:text-foreground">
              Home
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-3.5" />
          </li>
          <li aria-current="page" className="truncate font-medium text-foreground">
            {crumb}
          </li>
        </ol>
      </nav>

      <header
        className={cn(
          'grid overflow-hidden rounded-2xl border border-border bg-card',
          image && 'md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:grid-cols-[minmax(0,1fr)_24rem]'
        )}
      >
        <div className="flex min-w-0 flex-col justify-end gap-2 p-5 md:gap-3 md:p-10">
          {context.kind === 'store' && context.store && <StoreMark store={context.store} />}
          <p className="hidden text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase md:block">
            {EYEBROW[context.kind]}
          </p>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-balance break-words md:text-5xl">
            {context.title}
          </h1>
          {context.description && (
            <p className="max-w-xl text-sm text-muted-foreground md:text-base">
              {context.description}
            </p>
          )}
          {context.kind === 'search' && (
            <SearchForm key={context.query ?? ''} initialQuery={context.query ?? ''} />
          )}
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {countLabel(total, hasFilters, context.kind)}
          </p>
        </div>

        {image && (
          <div className="relative hidden md:block md:h-auto md:min-h-72">
            <img
              src={image}
              alt=""
              className="absolute inset-0 size-full object-cover object-[center_25%]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent md:bg-gradient-to-r" />
          </div>
        )}
      </header>
    </>
  )
}
