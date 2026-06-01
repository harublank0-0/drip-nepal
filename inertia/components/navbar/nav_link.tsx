import { Link } from '@adonisjs/inertia/react'
import { routes } from '@generated/registry'
import { usePage } from '@inertiajs/react'
import { cn } from '~/lib/utils'

type NavLinkProps = {
  // routePattern: (typeof routes)[keyof typeof routes]['pattern']
  route: keyof typeof routes
}
export const NavLink = (props: NavLinkProps & { children: React.ReactNode }) => {
  const { route, children } = props
  const { url } = usePage()

  const routePattern = routes[route].pattern
  const isActive = routePattern === url

  return (
    <Link
      route={route}
      className={cn(
        'border-b-2 border-transparent hover:border-white text-gray-400 hover:text-gray-100',
        {
          'border-white text-gray-100': isActive,
        }
      )}
    >
      {children}
    </Link>
  )
}
