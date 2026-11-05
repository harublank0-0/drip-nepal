import type { Data } from '@generated/data'

/*
 * Prop shapes sent by `CatalogController#listing`.
 */
export type ListingKind = 'men' | 'women' | 'category' | 'search' | 'store'

export type ListingSort = 'newest' | 'price_asc' | 'price_desc'

export type ListingContext = {
  kind: ListingKind
  title: string
  description: string
  query?: string
  category?: Data.Category
  store?: Data.StoreCard
}

export type FacetOption = {
  slug: string
  label: string
}

export type ListingFacets = {
  sizes: FacetOption[]
  colors: FacetOption[]
  categories: { name: string; slug: string; productCount: number }[]
  // Whole rupees, like the URL's min and max.
  price: { minRupees: number; maxRupees: number }
}

export type ListingFilters = {
  category?: string | null
  sizes: string[]
  colors: string[]
  min: number | null
  max: number | null
  sort: ListingSort
}
