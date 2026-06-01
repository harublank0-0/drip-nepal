import { usePage } from '@inertiajs/react'
import { LucideSearch, LucideShoppingBag, LucideUser } from 'lucide-react'
import { NavLink } from './nav_link'
import { Link } from '@adonisjs/inertia/react'
import { cn } from '~/lib/utils'
import { routes } from '@generated/registry'

export const NavBar = () => {
  const { url } = usePage()
  const isHomePage = routes.home.pattern === url
  return (
    <div
      className={cn('flex justify-between items-center p-8 py-4 bg-black', {
        'absolute top-0 left-0 right-0 z-10  bg-transparent backdrop-blur-xl bg-black/20':
          isHomePage,
      })}
    >
      <Link route="home">
        <div className="uppercase text-4xl font-bold">
          <span className="text-secondary">drip</span>
          <span className="text-primary">nepal</span>
        </div>
      </Link>

      <ul className="flex gap-4 capitalize text-white">
        <li>
          <NavLink route="men">Men</NavLink>
        </li>

        <li>
          <NavLink route="women">Women</NavLink>
        </li>

        {/* <li> */}
        {/*   <NavLink route="newly-arrived">newly arrived</NavLink> */}
        {/* </li> */}
        {/**/}
        {/* <li> */}
        {/*   <NavLink route="trending">trending</NavLink> */}
        {/* </li> */}
      </ul>

      <ul className="flex gap-6 text-white">
        <li>
          <LucideSearch />
        </li>

        <li>
          <LucideShoppingBag />
        </li>

        <li>
          <LucideUser />
        </li>
      </ul>
    </div>
  )
}
