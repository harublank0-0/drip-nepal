export type ProductColor = {
  value: string
  name: string
}

export type ProductSize = {
  label: string
  available: boolean
}

export type ProductImage = {
  id: number
  src: string
  alt: string
}

export type ProductReview = {
  id: number
  user: { name: string; avatar: string }
  rating: number
  date: string
  purchased: boolean
  comment: string
  images: string[]
  helpful: number
}

export type ProductStore = {
  name: string
  logo: string
  banner: string
  rating: number
  totalProducts: number
  totalFollowers: number
}

export type ProductData = {
  id: string
  store: ProductStore
  title: string
  rating: number
  reviewCount: number
  currency: string
  price: number
  compareAt: number | null
  discount: number | null
  status: string
  description: string
  specifications: { label: string; value: string }[]
  shippingReturns: string
  images: ProductImage[]
  colors: ProductColor[]
  sizes: ProductSize[]
  reviews: ProductReview[]
  relatedProducts: RelatedProduct[]
}

export type RelatedProduct = {
  id: string
  name: string
  description: string
  price: number
  image: string
  hoverImage?: string
  isBestSeller: boolean
  isFavorited: boolean
}

export const mockProduct: ProductData = {
  id: '1',
  store: {
    name: 'Drip Nepal Official',
    logo: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=100&h=100&fit=crop',
    banner: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=200&fit=crop',
    rating: 4.9,
    totalProducts: 247,
    totalFollowers: 12800,
  },
  title: 'Essential Oversized Hoodie',
  rating: 4.8,
  reviewCount: 124,
  currency: 'Rs',
  price: 3499,
  compareAt: 4499,
  discount: 22,
  status: 'In Stock',
  description:
    'The Essential Oversized Hoodie is crafted from heavyweight 400GSM cotton french terry. Designed with an exaggerated drop shoulder, ribbed cuffs and hem, and a spacious kangaroo pocket. Garment-dyed for a lived-in feel that only gets better with wear.',
  specifications: [
    { label: 'Material', value: '100% Cotton French Terry' },
    { label: 'Weight', value: '400 GSM' },
    { label: 'Fit', value: 'Oversized — take your regular size' },
    { label: 'Care', value: 'Machine wash cold, tumble dry low' },
    { label: 'Origin', value: 'Made in Nepal' },
  ],
  shippingReturns:
    'Free shipping on orders over Rs. 5,000. Standard delivery 3-5 business days. Easy returns within 14 days of delivery. Items must be unworn with tags attached.',
  images: [
    {
      id: 1,
      src: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80',
      alt: 'Front view of oversized hoodie',
    },
    {
      id: 2,
      src: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=800&q=80',
      alt: 'Model wearing hoodie outdoors',
    },
    {
      id: 3,
      src: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=800&q=80',
      alt: 'Side angle of relaxed fit hoodie',
    },
    {
      id: 4,
      src: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80',
      alt: 'Cotton fabric texture close-up',
    },
    {
      id: 5,
      src: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800&q=80',
      alt: 'Back view of oversized hoodie',
    },
    {
      id: 6,
      src: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80',
      alt: 'Street style layered outfit',
    },
  ],
  colors: [
    { value: '#1a1a1a', name: 'Black' },
    { value: '#f5f0e8', name: 'Bone' },
    { value: '#8b7355', name: 'Mocha' },
    { value: '#4a6741', name: 'Olive' },
    { value: '#2c3e50', name: 'Midnight' },
    { value: '#d4a574', name: 'Sand' },
  ],
  sizes: [
    { label: 'XS', available: true },
    { label: 'S', available: true },
    { label: 'M', available: true },
    { label: 'L', available: false },
    { label: 'XL', available: true },
    { label: 'XXL', available: true },
  ],
  reviews: [
    {
      id: 1,
      user: {
        name: 'Aarav',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=60&h=60&fit=crop',
      },
      rating: 5,
      date: '2025-12-01',
      purchased: true,
      comment:
        'Amazing quality hoodie. The fabric is incredibly thick and warm. Fits perfectly oversized as expected. Already ordered another color.',
      images: [],
      helpful: 12,
    },
    {
      id: 2,
      user: {
        name: 'Sita',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=60&h=60&fit=crop',
      },
      rating: 4,
      date: '2025-11-15',
      purchased: true,
      comment:
        'Great quality but runs a bit larger than expected. I would size down if you prefer a more fitted look. The bone color is beautiful.',
      images: ['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=200&q=80'],
      helpful: 8,
    },
    {
      id: 3,
      user: {
        name: 'Raj',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=60&h=60&fit=crop',
      },
      rating: 5,
      date: '2025-10-28',
      purchased: true,
      comment:
        'Best hoodie I have ever owned. The garment dye gives it a unique character. Shipping was fast and packaging was premium.',
      images: [
        'https://images.unsplash.com/photo-1578681994506-b8f463449011?w=200&q=80',
        'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=200&q=80',
      ],
      helpful: 15,
    },
    {
      id: 4,
      user: {
        name: 'Priya',
        avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=60&h=60&fit=crop',
      },
      rating: 3,
      date: '2025-10-10',
      purchased: true,
      comment:
        'Good quality but the olive color is darker than shown in photos. Still a nice hoodie, just not what I expected color-wise.',
      images: [],
      helpful: 4,
    },
  ],
  relatedProducts: [
    {
      id: '2',
      name: 'Cargo Pants',
      description: 'Relaxed fit with taper',
      price: 2799,
      image: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=300&q=80',
      hoverImage: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=300&q=80',
      isBestSeller: false,
      isFavorited: false,
    },
    {
      id: '3',
      name: 'Varsity Jacket',
      description: 'Wool blend with leather sleeves',
      price: 5999,
      image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=300&q=80',
      hoverImage: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=300&q=80',
      isBestSeller: true,
      isFavorited: false,
    },
    {
      id: '4',
      name: 'Graphic Tee',
      description: 'Limited edition print',
      price: 1499,
      image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=300&q=80',
      hoverImage: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=300&q=80',
      isBestSeller: false,
      isFavorited: true,
    },
    {
      id: '5',
      name: 'Track Pants',
      description: 'French terry jogger',
      price: 2499,
      image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=300&q=80',
      hoverImage: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=300&q=80',
      isBestSeller: false,
      isFavorited: false,
    },
    {
      id: '6',
      name: 'Denim Jacket',
      description: 'Classic trucker fit',
      price: 4999,
      image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=300&q=80',
      hoverImage: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=300&q=80',
      isBestSeller: false,
      isFavorited: true,
    },
  ],
}
