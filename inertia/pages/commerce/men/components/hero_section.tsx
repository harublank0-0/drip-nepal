import { Link } from '@adonisjs/inertia/react'
import MenShoes from '~/assets/men/shoes.jpg'
import MaleModel from '~/assets/men/male-model.jpg'
import { Button } from '~/components/ui/button'
import { LucideMoveRight } from 'lucide-react'

export function HeroSection() {
  return (
    <Link route="men">
      <div className="flex h-[80vh] overflow-hidden relative">
        <figure className="flex-1">
          <div className="" />
          <img src={MaleModel} alt="Stylish model" className="block object-fill h-full w-full" />
        </figure>

        <figure className="flex-1 relative">
          <img src={MenShoes} alt="Stylish shoes" className="block object-full h-full w-full" />
        </figure>

        <Button className="group absolute right-8 bottom-8 z-10 flex items-center overflow-hidden px-8 py-6 text-2xl capitalize opacity-90 transition-opacity duration-300 hover:opacity-100 cursor-pointer">
          <span>shop now</span>

          <span className="flex w-0 items-center overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:ml-3 group-hover:w-7 group-hover:opacity-100">
            <LucideMoveRight className="h-7 w-7" />
          </span>
        </Button>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      </div>
    </Link>
  )
}
