import { Link } from '@adonisjs/inertia/react'
import { ChevronRight, Home } from 'lucide-react'

type BreadcrumbProps = {
  slug: string
}

const LABEL_MAP: Record<string, string> = {
  men: "Men's",
  women: "Women's",
  sneakers: 'Sneakers',
  hoodies: 'Hoodies & Sweatshirts',
}

export function Breadcrumb({ slug }: BreadcrumbProps) {
  const label = LABEL_MAP[slug] || slug.charAt(0).toUpperCase() + slug.slice(1)

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground mb-4 md:mb-6"
    >
      <Link href="/" className="hover:text-foreground transition-colors flex items-center gap-1">
        <Home className="size-3.5" />
        <span className="hidden md:inline">Home</span>
      </Link>
      <ChevronRight className="size-3.5" />
      <span className="text-foreground font-medium" aria-current="page">
        {label}
      </span>
    </nav>
  )
}
