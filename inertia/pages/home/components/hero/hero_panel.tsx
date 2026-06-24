import { useState } from 'react'
import { Link } from '@adonisjs/inertia/react'
import type { routes } from '@generated/registry'
import { motion } from 'framer-motion'
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

const textVariants = {
  hidden: { y: 40, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] },
  },
}

const buttonVariants = {
  hidden: { y: 30, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.6, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
}

export const HeroPanel = (props: HeroPanelProps & { children: React.ReactNode }) => {
  const { image, title, cta, children } = props
  const [isHovered, setIsHovered] = useState(false)

  return (
    <motion.div
      className="group relative cursor-pointer overflow-hidden"
      animate={{ flex: isHovered ? 2 : 1 }}
      transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      role="region"
      aria-label={`${title} collection`}
    >
      <figure className="h-full overflow-hidden relative">
        <motion.img
          src={image.src}
          alt={image.alt}
          className="h-full w-full object-cover"
          animate={{ filter: isHovered ? 'grayscale(0%)' : 'grayscale(100%)' }}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        />

        <motion.div
          className="absolute inset-0 bg-black/50"
          animate={{ backgroundColor: isHovered ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.5)' }}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        />

        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center">
          <motion.h2
            className="text-6xl md:text-8xl lg:text-9xl font-heading font-bold uppercase tracking-wider mb-6"
            variants={textVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {title}
          </motion.h2>

          <motion.div
            variants={buttonVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <Button
              asChild
              variant="outline"
              className="bg-transparent text-white capitalize cursor-pointer rounded-none text-sm md:text-lg px-6 md:px-8 py-5 md:py-6 border-2 border-white/30 hover:bg-primary hover:border-primary transition-colors duration-300"
            >
              <Link route={cta.route}>{cta.label}</Link>
            </Button>
          </motion.div>
        </div>
      </figure>

      {children}
    </motion.div>
  )
}
