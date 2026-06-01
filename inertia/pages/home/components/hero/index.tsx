import ManImage from '~/assets/hero-image/man.png'
import WomanImage from '~/assets/hero-image/woman.png'
import { Button } from '~/components/ui/button'
import { Typography } from '~/components/ui/typography'
import { HeroPanel, HeroPanelProps } from './hero-panel'

const manPanel: HeroPanelProps = {
  image: {
    src: ManImage,
    alt: "Men's streetware",
  },
  title: 'men',
  cta: {
    route: 'home',
    label: 'shop for men',
  },
}

const womanPanel: HeroPanelProps = {
  image: {
    src: WomanImage,
    alt: "Women's streetware",
  },
  title: 'women',
  cta: {
    route: 'home',
    label: 'shop for women',
  },
}

export const Hero = () => {
  return (
    <div className="flex h-screen w-screen cursor-pointer">
      <HeroPanel {...manPanel}>
        <div className="absolute top-1/2 left-0 rotate-90 -translate-x-1/3">
          <Typography.Muted className="uppercase tracking-wider text-lg">
            Drip Nepal // HImalayan Brutalism
          </Typography.Muted>
        </div>
      </HeroPanel>

      <HeroPanel {...womanPanel}>
        <div className="absolute top-8 right-8">
          <Typography.Muted className="uppercase tracking-wider text-lg">
            KTM 27.7172 N, 85.3240 E
          </Typography.Muted>
        </div>
      </HeroPanel>
    </div>
  )
}
