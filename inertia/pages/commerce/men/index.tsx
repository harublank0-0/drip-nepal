import type { InertiaProps } from '~/types'
import { HeroSection } from './components/hero_section'
import { MensTrending } from './components/mens_trending'

type PageProps = InertiaProps<{}>

export default function Men({}: PageProps) {
  return (
    <div className="">
      <HeroSection />
      <MensTrending />
    </div>
  )
}
