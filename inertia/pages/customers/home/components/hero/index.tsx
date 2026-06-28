import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import ManImage from '~/assets/hero-image/man.png'
import WomanImage from '~/assets/hero-image/woman.png'
import { Typography } from '~/components/ui/typography'
import { HeroPanel, type HeroPanelProps } from './hero_panel'

const manPanel: HeroPanelProps = {
  image: {
    src: ManImage,
    alt: "Men's streetwear collection",
  },
  title: 'men',
  cta: {
    route: 'men',
    label: 'shop for men',
  },
}

const womanPanel: HeroPanelProps = {
  image: {
    src: WomanImage,
    alt: "Women's streetwear collection",
  },
  title: 'women',
  cta: {
    route: 'women',
    label: 'shop for women',
  },
}

export const Hero = () => {
  return (
    <section
      aria-label="Featured collections"
      className="flex flex-col md:flex-row h-screen bg-black relative overflow-hidden"
    >
      <HeroPanel {...manPanel}>
        <div className="absolute top-1/2 left-0 rotate-90 -translate-x-1/3 hidden md:block">
          <Typography.Muted className="uppercase tracking-widest text-xs md:text-sm">
            Drip Nepal // Himalayan Brutalism
          </Typography.Muted>
        </div>
      </HeroPanel>

      <HeroPanel {...womanPanel}>
        <div className="absolute top-4 md:top-8 right-4 md:right-8">
          <Typography.Muted className="uppercase tracking-widest text-xs md:text-sm">
            KTM 27.7172&deg;N, 85.3240&deg;E
          </Typography.Muted>
        </div>
      </HeroPanel>

      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      >
        <ChevronDown className="size-6 text-white/50" />
      </motion.div>
    </section>
  )
}
