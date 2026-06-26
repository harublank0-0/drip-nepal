// TODO: move this to shared file
export const Categories = [
  {
    name: 'Streetwear',
    slug: 'streetwear',
    description:
      'Modern street fashion including oversized fits, cargos, hoodies, and urban essentials.',
    image: 'https://images.unsplash.com/photo-1523398002811-999ca8dec234',
    isActive: true,
  },

  {
    name: 'T-Shirts',
    slug: 't-shirts',
    description: 'Casual and graphic t-shirts for everyday wear and street fashion.',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab',
    isActive: true,
  },

  {
    name: 'Hoodies',
    slug: 'hoodies',
    description: 'Oversized, zip-up, and pullover hoodies for all seasons.',
    image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c',
    isActive: true,
  },

  {
    name: 'Sneakers',
    slug: 'sneakers',
    description: 'Trending sneakers and lifestyle footwear for daily fashion.',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff',
    isActive: true,
  },

  {
    name: 'Jackets',
    slug: 'jackets',
    description: 'Bomber jackets, denim jackets, puffers, and lightweight outerwear.',
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f',
    isActive: true,
  },

  {
    name: 'Cargo Pants',
    slug: 'cargo-pants',
    description: 'Relaxed-fit cargo pants and utility-inspired streetwear bottoms.',
    image: 'https://images.unsplash.com/photo-1506629905607-d405b7a1b47e',
    isActive: true,
  },

  {
    name: 'Watches',
    slug: 'watches',
    description: 'Fashion watches and minimal accessories for modern outfits.',
    image: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49',
    isActive: true,
  },

  {
    name: 'Bags',
    slug: 'bags',
    description: 'Crossbody bags, tote bags, backpacks, and everyday carry essentials.',
    image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa',
    isActive: true,
  },

  {
    name: 'Accessories',
    slug: 'accessories',
    description: 'Chains, rings, caps, sunglasses, and other fashion accessories.',
    image: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f',
    isActive: true,
  },

  {
    name: 'Traditional Wear',
    slug: 'traditional-wear',
    description: 'Nepali and South Asian traditional clothing for cultural occasions.',
    image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c',
    isActive: true,
  },

  {
    name: 'Kurtas',
    slug: 'kurtas',
    description: 'Modern and traditional kurtas for casual and festive wear.',
    image: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1',
    isActive: true,
  },

  {
    name: 'Sarees',
    slug: 'sarees',
    description: 'Elegant sarees for weddings, festivals, and traditional celebrations.',
    image: 'https://images.unsplash.com/photo-1610189002636-9f9d8dba2d91',
    isActive: true,
  },

  {
    name: 'Women Fashion',
    slug: 'women-fashion',
    description: 'Trendy clothing and fashion essentials curated for women.',
    image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c',
    isActive: true,
  },

  {
    name: 'Men Fashion',
    slug: 'men-fashion',
    description: 'Contemporary menswear including casual, street, and traditional styles.',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e',
    isActive: true,
  },
] as const

export type Category = (typeof Categories)[number]
