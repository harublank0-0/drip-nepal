import type { Data } from '@generated/data'
import { Hero } from './components/hero'
import { CategoryRow, type HomeCategory } from './components/categories/category_row'
import { FeaturedProducts } from './components/featured/featured_products'
import { FeaturedStores } from './components/featured/featured_stores'
import { OrderingInfo } from './components/ordering_info'
import CustomersLayout from '~/layouts/customers_layout'
import RootLayout from '~/layouts/root_layout'
import type { InertiaProps } from '~/types'

type PageProps = InertiaProps<{
  newArrivals: Data.ProductCard[]
  featuredStores: Data.StoreCard[]
  categories: HomeCategory[]
}>

export default function Home({ newArrivals, featuredStores, categories }: PageProps) {
  return (
    <>
      <Hero />
      <OrderingInfo />
      {categories.length > 0 && <CategoryRow categories={categories} />}
      {newArrivals.length > 0 && <FeaturedProducts products={newArrivals} />}
      {/* With a single shop, a "featured stores" list of one says nothing. */}
      {featuredStores.length > 1 && <FeaturedStores stores={featuredStores} />}
    </>
  )
}

Home.layout = [RootLayout, CustomersLayout]
