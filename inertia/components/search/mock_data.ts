import type { ProductResult, StoreResult, CategoryResult, SearchSuggestion } from './types'

export const RECENT_SEARCHES = [
  'Oversized Hoodie',
  'Nike Shoes',
  'Black Jacket',
  'Cargo Pants',
  'Denim Jacket',
]

export const TRENDING_SEARCHES = [
  'Hoodies',
  'Sneakers',
  'Summer Collection',
  'Cargo Pants',
  'Graphic Tees',
]

export const mockProducts: ProductResult[] = [
  {
    id: '1',
    name: 'Essential Oversized Hoodie',
    storeName: 'Drip Nepal Official',
    price: 3499,
    compareAt: 4499,
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=200&q=80',
    rating: 4.8,
    reviewCount: 124,
  },
  {
    id: '2',
    name: 'Cargo Pants Relaxed Fit',
    storeName: 'Urban Collective',
    price: 2799,
    compareAt: null,
    image: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=200&q=80',
    rating: 4.5,
    reviewCount: 89,
  },
  {
    id: '3',
    name: 'Varsity Wool Jacket',
    storeName: 'Heritage Supply',
    price: 5999,
    compareAt: 7499,
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&q=80',
    rating: 4.9,
    reviewCount: 56,
  },
  {
    id: '4',
    name: 'Graphic Tee Limited',
    storeName: 'Drip Nepal Official',
    price: 1499,
    compareAt: null,
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=200&q=80',
    rating: 4.3,
    reviewCount: 202,
  },
  {
    id: '5',
    name: 'French Terry Track Pants',
    storeName: 'Motion Lab',
    price: 2499,
    compareAt: 3299,
    image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=200&q=80',
    rating: 4.6,
    reviewCount: 71,
  },
  {
    id: '6',
    name: 'Classic Denim Jacket',
    storeName: 'Heritage Supply',
    price: 4999,
    compareAt: null,
    image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=200&q=80',
    rating: 4.7,
    reviewCount: 93,
  },
  {
    id: '7',
    name: 'Slim Fit Chinos',
    storeName: 'Urban Collective',
    price: 2199,
    compareAt: 2799,
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=200&q=80',
    rating: 4.4,
    reviewCount: 118,
  },
  {
    id: '8',
    name: 'Performance Sneakers',
    storeName: 'Motion Lab',
    price: 3999,
    compareAt: 4999,
    image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=200&q=80',
    rating: 4.8,
    reviewCount: 156,
  },
]

export const mockStores: StoreResult[] = [
  {
    id: '1',
    name: 'Drip Nepal Official',
    logo: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=60&h=60&fit=crop',
    rating: 4.9,
    followerCount: 12800,
    productCount: 247,
  },
  {
    id: '2',
    name: 'Urban Collective',
    logo: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=60&h=60&fit=crop',
    rating: 4.7,
    followerCount: 8900,
    productCount: 156,
  },
  {
    id: '3',
    name: 'Heritage Supply',
    logo: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=60&h=60&fit=crop',
    rating: 4.8,
    followerCount: 6200,
    productCount: 89,
  },
  {
    id: '4',
    name: 'Motion Lab',
    logo: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=60&h=60&fit=crop',
    rating: 4.6,
    followerCount: 4300,
    productCount: 112,
  },
]

export const mockCategories: CategoryResult[] = [
  {
    id: '1',
    name: 'Men',
    productCount: 342,
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=200&q=80',
  },
  {
    id: '2',
    name: 'Women',
    productCount: 289,
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=200&q=80',
  },
  {
    id: '3',
    name: 'Sneakers',
    productCount: 156,
    image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=200&q=80',
  },
  {
    id: '4',
    name: 'Accessories',
    productCount: 98,
    image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=200&q=80',
  },
]

export const mockSuggestions: SearchSuggestion[] = [
  { text: 'hoodie', type: 'category' },
  { text: 'hoodie black', type: 'product' },
  { text: 'hoodie oversized', type: 'product' },
  { text: 'hoodie men', type: 'category' },
  { text: 'hoodie women', type: 'category' },
]

export function searchProducts(query: string): SearchSuggestion[] {
  const q = query.toLowerCase()
  return mockSuggestions.filter((s) => s.text.includes(q))
}

export function filterProducts(query: string): ProductResult[] {
  const q = query.toLowerCase()
  return mockProducts.filter(
    (p) => p.name.toLowerCase().includes(q) || p.storeName.toLowerCase().includes(q)
  )
}

export function filterStores(query: string): StoreResult[] {
  const q = query.toLowerCase()
  return mockStores.filter((s) => s.name.toLowerCase().includes(q))
}

export function filterCategories(query: string): CategoryResult[] {
  const q = query.toLowerCase()
  return mockCategories.filter((c) => c.name.toLowerCase().includes(q))
}
