import { Hero } from './components/hero'
import { CategoryCards } from './components/categories/category_cards'
import { FeaturedProducts } from './components/featured/featured_products'
import { FeaturedStores } from './components/featured/featured_stores'
import CustomersLayout from '~/layouts/customers_layout'
import RootLayout from '~/layouts/root_layout'

export default function Home() {
  return (
    <>
      <Hero />
      <CategoryCards />
      <FeaturedProducts />
      <FeaturedStores />
    </>
  )
}

Home.layout = [RootLayout, CustomersLayout]
