import type { MouseEvent } from 'react'
import type { Data } from '@generated/data'

/*
 * `data` of GET /api/v1/search/suggestions.
 */
export type SearchSuggestions = {
  products: Data.ProductCard[]
  stores: Data.StoreCard[]
}

/*
 * A row the keyboard can move to in the search modal.
 */
export type SearchOption =
  | { type: 'product'; id: string; href: string; product: Data.ProductCard }
  | { type: 'store'; id: string; href: string; store: Data.StoreCard }
  | { type: 'all'; id: string; href: string }

/*
 * What every option row needs from the modal.
 */
export type OptionRowProps = {
  id: string
  isActive: boolean
  onHover: () => void
  onSelect: (event: MouseEvent) => void
}
