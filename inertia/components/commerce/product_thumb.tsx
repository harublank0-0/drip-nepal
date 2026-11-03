import { ImageOffIcon } from 'lucide-react'
import { cn } from '~/lib/utils'

type ProductThumbProps = {
  image: string | null
  className?: string
}

/*
 * A square product image for cart and order lines. The product name sits
 * next to it, so the image is decorative.
 */
export function ProductThumb({ image, className }: ProductThumbProps) {
  return (
    <div
      className={cn(
        'flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted',
        className
      )}
    >
      {image ? (
        <img src={image} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <ImageOffIcon className="size-5 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  )
}
