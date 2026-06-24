export type ProductResult = {
  id: string
  name: string
  storeName: string
  price: number
  compareAt: number | null
  image: string
  rating: number
  reviewCount: number
}

export type StoreResult = {
  id: string
  name: string
  logo: string
  rating: number
  followerCount: number
  productCount: number
}

export type CategoryResult = {
  id: string
  name: string
  productCount: number
  image?: string
}

export type SearchSuggestion = {
  text: string
  type: 'product' | 'store' | 'category'
}

export type SearchState = 'empty' | 'loading' | 'results' | 'no-results'

export type SearchResults = {
  products: ProductResult[]
  stores: StoreResult[]
  categories: CategoryResult[]
  suggestions: SearchSuggestion[]
}
