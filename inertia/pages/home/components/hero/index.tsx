import ManImage from '~/assets/hero-image/man.png'
import WomanImage from '~/assets/hero-image/woman.png'
import { Typography } from '~/components/ui/typography'
import { HeroPanel, type HeroPanelProps } from './hero_panel'

const manPanel: HeroPanelProps = {
  image: {
    src: ManImage,
    alt: "Men's streetware",
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
    alt: "Women's streetware",
  },
  title: 'women',
  cta: {
    route: 'women',
    label: 'shop for women',
  },
}

export const Hero = () => {
  return (
    <div className="flex h-[90vh] cursor-pointer bg-black">
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
            KTM 27.7172&deg;N, 85.3240&deg;E
          </Typography.Muted>
        </div>
      </HeroPanel>
    </div>
  )
}
