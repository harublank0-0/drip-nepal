import { Hero } from './components/hero'
import { CategoryCards } from './components/categories/category_cards'
import { FeaturedProducts } from './components/featured/featured_products'
import { FeaturedStores } from './components/featured/featured_stores'

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
