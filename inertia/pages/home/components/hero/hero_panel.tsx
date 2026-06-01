import { Link } from '@adonisjs/inertia/react'
import type { routes } from '@generated/registry'
import { Button } from '~/components/ui/button'
import { Typography } from '~/components/ui/typography'

export type HeroPanelProps = {
  image: {
    src: string
    alt: string
  }
  title: string
  cta: {
    route: keyof typeof routes
    label: string
  }
}
export const HeroPanel = (props: HeroPanelProps & { children: React.ReactNode }) => {
  const { image, title, cta, children } = props
  return (
    <div className="w-1/2 hover:w-2/3 transition-all duration-700 ease-in-out group relative">
      <figure className="h-full overflow-hidden relative">
        <img
          src={image.src}
          alt={image.alt}
          className="h-full w-full object-cover grayscale group-hover:filter-none"
        />
        <div className="absolute top-0 left-0 w-full h-full bg-black/50 group-hover:bg-black/10 transition-colors duration-700 ease-in-out" />

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 uppercase text-secondary text-center">
          <Typography.Large className="text-8xl mb-4 group-hover:-translate-y-4 transition-all duration-600">
            {title}
          </Typography.Large>

          <Button
            asChild
            variant="outline"
            className="bg-transparent capitalize cursor-pointer rounded-none text-lg px-8 py-6 opacity-0 group-hover:opacity-100 transition-all duration-600 translate-y-10 group-hover:translate-y-0 hover:bg-primary hover:border-primary"
          >
            <Link route={cta.route}>{cta.label}</Link>
          </Button>
        </div>
      </figure>

      {children}
    </div>
  )
}
