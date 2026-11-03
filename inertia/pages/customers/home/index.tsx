import type { Data } from '@generated/data'
import { Hero } from './components/hero'
import { CategoryCards } from './components/categories/category_cards'
import { FeaturedProducts } from './components/featured/featured_products'
import { FeaturedStores } from './components/featured/featured_stores'
import CustomersLayout from '~/layouts/customers_layout'
import RootLayout from '~/layouts/root_layout'
import type { InertiaProps } from '~/types'

type PageProps = InertiaProps<{
  newArrivals: Data.ProductCard[]
  featuredStores: Data.StoreCard[]
}>

export default function Home({ newArrivals, featuredStores }: PageProps) {
  return (
    <>
      <Hero />
      <CategoryCards />
      {newArrivals.length > 0 && <FeaturedProducts products={newArrivals} />}
      {featuredStores.length > 0 && <FeaturedStores stores={featuredStores} />}
    </>
  )
}

Home.layout = [RootLayout, CustomersLayout]
