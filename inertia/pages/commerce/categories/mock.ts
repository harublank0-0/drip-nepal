export type CategoryProduct = {
  id: string
  storeName: string
  storeLogo?: string
  name: string
  price: number
  compareAt: number | null
  discount: number | null
  currency: string
  image: string
  hoverImage?: string
  rating: number
  reviewCount: number
  colors: { value: string; name: string }[]
  sizes: string[]
  badge: 'new' | 'sale' | 'best-seller' | 'limited' | null
  isFavorited: boolean
  inStock: boolean
}

export type Brand = {
  id: string
  name: string
  count: number
}

export type Store = {
  id: string
  name: string
  logo: string
  count: number
}

export type CategoryData = {
  slug: string
  title: string
  description: string
  heroImage: string
  totalProducts: number
  products: CategoryProduct[]
  brands: Brand[]
  stores: Store[]
  minPrice: number
  maxPrice: number
}

export type SortOption =
  | 'featured'
  | 'newest'
  | 'price-asc'
  | 'price-desc'
  | 'popular'
  | 'rating'
  | 'discount'

export type FilterState = {
  brands: string[]
  stores: string[]
  sizes: string[]
  colors: string[]
  priceRange: [number, number]
  discount: number | null
  rating: number | null
  inStock: boolean | null
  sort: SortOption
  view: '2' | '3' | '4'
  page: number
}

const MOCK_PRODUCTS: CategoryProduct[] = [
  {
    id: 'p1',
    storeName: 'Urban Threads',
    name: 'Oversized Cotton Hoodie',
    price: 3499,
    compareAt: 4499,
    discount: 22,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1578768079052-aa76e52ff62e?w=800&q=80',
    rating: 4.5,
    reviewCount: 128,
    colors: [
      { value: '#1a1a1a', name: 'Black' },
      { value: '#f5f5f5', name: 'White' },
      { value: '#8b4513', name: 'Brown' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    badge: 'best-seller',
    isFavorited: true,
    inStock: true,
  },
  {
    id: 'p2',
    storeName: 'Sneaker District',
    name: 'Minimal Leather Sneakers',
    price: 8999,
    compareAt: 10999,
    discount: 18,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&q=80',
    rating: 4.8,
    reviewCount: 256,
    colors: [
      { value: '#ffffff', name: 'White' },
      { value: '#1a1a1a', name: 'Black' },
    ],
    sizes: ['M', 'L', 'XL'],
    badge: 'new',
    isFavorited: false,
    inStock: true,
  },
  {
    id: 'p3',
    storeName: 'Denim Co.',
    name: 'Relaxed Fit Cargo Pants',
    price: 4299,
    compareAt: 5299,
    discount: 19,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1604176354204-9268737828e4?w=800&q=80',
    rating: 4.3,
    reviewCount: 89,
    colors: [
      { value: '#2d2d2d', name: 'Charcoal' },
      { value: '#5b4a3b', name: 'Khaki' },
      { value: '#1a1a1a', name: 'Black' },
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    badge: null,
    isFavorited: false,
    inStock: true,
  },
  {
    id: 'p4',
    storeName: 'Apex Fit',
    name: 'Performance Dri-Fit Tee',
    price: 1899,
    compareAt: 2499,
    discount: 24,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&q=80',
    rating: 4.1,
    reviewCount: 312,
    colors: [
      { value: '#1a1a1a', name: 'Black' },
      { value: '#ffffff', name: 'White' },
      { value: '#cc2936', name: 'Red' },
      { value: '#2d5a27', name: 'Forest' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    badge: null,
    isFavorited: false,
    inStock: true,
  },
  {
    id: 'p5',
    storeName: 'Street Haus',
    name: 'Vintage Washed Denim Jacket',
    price: 7499,
    compareAt: 8999,
    discount: 17,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&q=80',
    rating: 4.6,
    reviewCount: 175,
    colors: [
      { value: '#4a6fa5', name: 'Wash Blue' },
      { value: '#2d2d2d', name: 'Charcoal' },
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    badge: 'best-seller',
    isFavorited: true,
    inStock: true,
  },
  {
    id: 'p6',
    storeName: 'Luxe Layers',
    name: 'Merino Wool Crew Sweater',
    price: 5999,
    compareAt: 7499,
    discount: 20,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1434389677669-e08b4cda3a80?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&q=80',
    rating: 4.4,
    reviewCount: 94,
    colors: [
      { value: '#c4a882', name: 'Beige' },
      { value: '#1a1a1a', name: 'Black' },
      { value: '#696969', name: 'Grey' },
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    badge: 'new',
    isFavorited: false,
    inStock: true,
  },
  {
    id: 'p7',
    storeName: 'Nomad Supply',
    name: 'Technical Shell Jacket',
    price: 12999,
    compareAt: 15999,
    discount: 19,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1544923246-77307dd270b4?w=800&q=80',
    rating: 4.7,
    reviewCount: 63,
    colors: [
      { value: '#1a1a1a', name: 'Black' },
      { value: '#2d5a27', name: 'Forest' },
      { value: '#4a6fa5', name: 'Navy' },
    ],
    sizes: ['M', 'L', 'XL', 'XXL'],
    badge: 'limited',
    isFavorited: true,
    inStock: true,
  },
  {
    id: 'p8',
    storeName: 'Sneaker District',
    name: 'Retro Running Sneakers',
    price: 6999,
    compareAt: null,
    discount: null,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800&q=80',
    rating: 4.2,
    reviewCount: 201,
    colors: [
      { value: '#ffffff', name: 'White' },
      { value: '#1a1a1a', name: 'Black' },
      { value: '#cc2936', name: 'Red' },
    ],
    sizes: ['M', 'L', 'XL'],
    badge: null,
    isFavorited: false,
    inStock: true,
  },
  {
    id: 'p9',
    storeName: 'Urban Threads',
    name: 'Loose Fit Graphic Tee',
    price: 1599,
    compareAt: 1999,
    discount: 20,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=800&q=80',
    rating: 3.9,
    reviewCount: 445,
    colors: [
      { value: '#ffffff', name: 'White' },
      { value: '#1a1a1a', name: 'Black' },
      { value: '#cc2936', name: 'Red' },
      { value: '#2d5a27', name: 'Forest' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    badge: null,
    isFavorited: false,
    inStock: true,
  },
  {
    id: 'p10',
    storeName: 'Apex Fit',
    name: 'Thermal Compression Leggings',
    price: 2799,
    compareAt: 3499,
    discount: 20,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80',
    rating: 4.0,
    reviewCount: 178,
    colors: [
      { value: '#1a1a1a', name: 'Black' },
      { value: '#2d2d2d', name: 'Charcoal' },
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    badge: null,
    isFavorited: false,
    inStock: true,
  },
  {
    id: 'p11',
    storeName: 'Street Haus',
    name: 'Oversized Puffer Vest',
    price: 5499,
    compareAt: 6999,
    discount: 21,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&q=80',
    rating: 4.3,
    reviewCount: 87,
    colors: [
      { value: '#1a1a1a', name: 'Black' },
      { value: '#696969', name: 'Grey' },
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    badge: 'sale',
    isFavorited: false,
    inStock: false,
  },
  {
    id: 'p12',
    storeName: 'Denim Co.',
    name: 'Slim Fit Chino Pants',
    price: 3799,
    compareAt: 4499,
    discount: 16,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1604176354204-9268737828e4?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&q=80',
    rating: 4.4,
    reviewCount: 156,
    colors: [
      { value: '#5b4a3b', name: 'Khaki' },
      { value: '#2d2d2d', name: 'Charcoal' },
      { value: '#1a1a1a', name: 'Black' },
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    badge: null,
    isFavorited: false,
    inStock: true,
  },
  {
    id: 'p13',
    storeName: 'Luxe Layers',
    name: 'Cashmere Blend Scarf',
    price: 2999,
    compareAt: 3999,
    discount: 25,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1520903920243-00d872a2d1c2?w=800&q=80',
    rating: 4.6,
    reviewCount: 42,
    colors: [
      { value: '#c4a882', name: 'Beige' },
      { value: '#1a1a1a', name: 'Black' },
      { value: '#cc2936', name: 'Red' },
    ],
    sizes: ['M', 'L'],
    badge: 'sale',
    isFavorited: false,
    inStock: true,
  },
  {
    id: 'p14',
    storeName: 'Nomad Supply',
    name: 'Waterproof Hiking Boots',
    price: 10999,
    compareAt: 13999,
    discount: 21,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1520637619047-3a8b0a33c10c?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1544923246-77307dd270b4?w=800&q=80',
    rating: 4.8,
    reviewCount: 219,
    colors: [
      { value: '#5b4a3b', name: 'Khaki' },
      { value: '#2d2d2d', name: 'Charcoal' },
    ],
    sizes: ['M', 'L', 'XL', 'XXL'],
    badge: null,
    isFavorited: false,
    inStock: true,
  },
  {
    id: 'p15',
    storeName: 'Urban Threads',
    name: 'Cropped Knit Cardigan',
    price: 4299,
    compareAt: null,
    discount: null,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1434389677669-e08b4cda3a80?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80',
    rating: 4.2,
    reviewCount: 73,
    colors: [
      { value: '#696969', name: 'Grey' },
      { value: '#c4a882', name: 'Beige' },
    ],
    sizes: ['S', 'M', 'L'],
    badge: 'new',
    isFavorited: true,
    inStock: true,
  },
  {
    id: 'p16',
    storeName: 'Sneaker District',
    name: 'Platform Chunky Sneakers',
    price: 7999,
    compareAt: 9999,
    discount: 20,
    currency: 'Rs',
    image: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=80',
    rating: 4.5,
    reviewCount: 167,
    colors: [
      { value: '#ffffff', name: 'White' },
      { value: '#1a1a1a', name: 'Black' },
      { value: '#c4a882', name: 'Beige' },
    ],
    sizes: ['M', 'L', 'XL'],
    badge: 'limited',
    isFavorited: false,
    inStock: true,
  },
]

const MOCK_BRANDS: Brand[] = [
  { id: 'b1', name: 'Nike', count: 42 },
  { id: 'b2', name: 'Adidas', count: 38 },
  { id: 'b3', name: 'Puma', count: 25 },
  { id: 'b4', name: 'New Balance', count: 31 },
  { id: 'b5', name: 'The North Face', count: 19 },
  { id: 'b6', name: "Levi's", count: 27 },
  { id: 'b7', name: 'Carhartt', count: 22 },
  { id: 'b8', name: 'Patagonia', count: 16 },
]

const MOCK_STORES: Store[] = [
  { id: 's1', name: 'Urban Threads', logo: 'UT', count: 34 },
  { id: 's2', name: 'Sneaker District', logo: 'SD', count: 28 },
  { id: 's3', name: 'Denim Co.', logo: 'DC', count: 22 },
  { id: 's4', name: 'Apex Fit', logo: 'AF', count: 45 },
  { id: 's5', name: 'Street Haus', logo: 'SH', count: 19 },
  { id: 's6', name: 'Luxe Layers', logo: 'LL', count: 15 },
  { id: 's7', name: 'Nomad Supply', logo: 'NS', count: 31 },
]

export function getCategoryData(slug: string): CategoryData {
  const categoryMap: Record<string, Omit<CategoryData, 'slug'>> = {
    men: {
      title: "Men's Collection",
      description: 'Curated essentials and statement pieces for the modern wardrobe.',
      heroImage: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?w=1920&q=85',
      totalProducts: 1248,
      products: MOCK_PRODUCTS,
      brands: MOCK_BRANDS,
      stores: MOCK_STORES,
      minPrice: 1599,
      maxPrice: 12999,
    },
    women: {
      title: "Women's Collection",
      description: 'Effortless style from day to night. Discover what moves you.',
      heroImage: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1920&q=85',
      totalProducts: 1832,
      products: MOCK_PRODUCTS.map((p) => ({ ...p, id: `w-${p.id}` })),
      brands: MOCK_BRANDS,
      stores: MOCK_STORES,
      minPrice: 1599,
      maxPrice: 12999,
    },
    sneakers: {
      title: 'Sneakers',
      description: 'Fresh kicks for every stride. From retro runners to modern chunky soles.',
      heroImage: 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=1920&q=85',
      totalProducts: 567,
      products: MOCK_PRODUCTS.filter((p) => p.storeName === 'Sneaker District' || p.id === 'p14'),
      brands: [MOCK_BRANDS[0], MOCK_BRANDS[1], MOCK_BRANDS[3]],
      stores: MOCK_STORES.filter((s) => s.name === 'Sneaker District' || s.name === 'Nomad Supply'),
      minPrice: 6999,
      maxPrice: 12999,
    },
    hoodies: {
      title: 'Hoodies & Sweatshirts',
      description: 'Oversized, cropped, or classic — the layer you live in.',
      heroImage: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=1920&q=85',
      totalProducts: 345,
      products: MOCK_PRODUCTS.filter((p) => p.id === 'p1' || p.id === 'p15'),
      brands: [MOCK_BRANDS[2], MOCK_BRANDS[5], MOCK_BRANDS[6]],
      stores: MOCK_STORES.filter((s) => s.name === 'Urban Threads'),
      minPrice: 3499,
      maxPrice: 4299,
    },
  }

  const data = categoryMap[slug]
  if (!data) {
    return {
      slug,
      title: 'Category',
      description: 'Browse our collection.',
      heroImage: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=1920&q=85',
      totalProducts: 0,
      products: [],
      brands: [],
      stores: [],
      minPrice: 0,
      maxPrice: 0,
    }
  }

  return { slug, ...data }
}

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'popular', label: 'Most Popular' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'discount', label: 'Discount' },
]

export const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

export const ALL_COLORS: { value: string; name: string }[] = [
  { value: '#1a1a1a', name: 'Black' },
  { value: '#ffffff', name: 'White' },
  { value: '#696969', name: 'Grey' },
  { value: '#2d2d2d', name: 'Charcoal' },
  { value: '#c4a882', name: 'Beige' },
  { value: '#5b4a3b', name: 'Khaki' },
  { value: '#4a6fa5', name: 'Navy' },
  { value: '#2d5a27', name: 'Forest' },
  { value: '#cc2936', name: 'Red' },
  { value: '#8b4513', name: 'Brown' },
]

export const DISCOUNT_OPTIONS = [
  { value: 10, label: '10% and above' },
  { value: 20, label: '20% and above' },
  { value: 30, label: '30% and above' },
  { value: 50, label: '50% and above' },
]

export const RATING_OPTIONS = [
  { value: 4, label: '4★ & above' },
  { value: 3, label: '3★ & above' },
  { value: 2, label: '2★ & above' },
]

export function getDefaultFilterState(data: CategoryData): FilterState {
  return {
    brands: [],
    stores: [],
    sizes: [],
    colors: [],
    priceRange: [data.minPrice, data.maxPrice],
    discount: null,
    rating: null,
    inStock: null,
    sort: 'featured',
    view: '3',
    page: 1,
  }
}

export function sortProducts(products: CategoryProduct[], sort: SortOption): CategoryProduct[] {
  const sorted = [...products]
  switch (sort) {
    case 'newest':
      return sorted.reverse()
    case 'price-asc':
      return sorted.sort((a, b) => a.price - b.price)
    case 'price-desc':
      return sorted.sort((a, b) => b.price - a.price)
    case 'popular':
      return sorted.sort((a, b) => b.reviewCount - a.reviewCount)
    case 'rating':
      return sorted.sort((a, b) => b.rating - a.rating)
    case 'discount':
      return sorted.sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0))
    default:
      return sorted
  }
}

export function filterProducts(
  products: CategoryProduct[],
  filters: FilterState
): CategoryProduct[] {
  return products.filter((p) => {
    if (filters.brands.length > 0 && !filters.brands.includes(p.storeName)) return false
    if (filters.stores.length > 0 && !filters.stores.includes(p.storeName)) return false
    if (filters.sizes.length > 0 && !p.sizes.some((s) => filters.sizes.includes(s))) return false
    if (filters.colors.length > 0 && !p.colors.some((c) => filters.colors.includes(c.value)))
      return false
    if (p.price < filters.priceRange[0] || p.price > filters.priceRange[1]) return false
    if (filters.discount !== null && (p.discount ?? 0) < filters.discount) return false
    if (filters.rating !== null && p.rating < filters.rating) return false
    if (filters.inStock === true && !p.inStock) return false
    if (filters.inStock === false && p.inStock) return false
    return true
  })
}

export const RECENTLY_VIEWED: CategoryProduct[] = MOCK_PRODUCTS.slice(0, 6)

export const RECOMMENDED_PRODUCTS: CategoryProduct[] = [
  ...MOCK_PRODUCTS.slice(6, 12),
  ...MOCK_PRODUCTS.slice(0, 2),
]
