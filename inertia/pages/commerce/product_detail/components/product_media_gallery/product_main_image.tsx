import { Carousel, type CarouselApi, CarouselContent, CarouselItem } from '~/components/ui/carousel'
import { cn } from '~/lib/utils'
import CarouselFade from 'embla-carousel-fade'
import { useMousePosition } from '~/pages/commerce/product_detail/hooks/use_mouse_position'
import { LucideExpand, LucideX } from 'lucide-react'
import { Show } from '~/components/ui/show'

type ProductMainImageProps = {
  productImages: {
    id: number
    src: string
    alt: string
  }[]
  fade?: boolean
  isFullScreen?: boolean
  setShowImageDialog?: React.Dispatch<React.SetStateAction<boolean>>
  setMainImageCarousel: React.Dispatch<React.SetStateAction<CarouselApi>>
}

export function ProductMainImage(props: ProductMainImageProps) {
  const {
    productImages,
    setMainImageCarousel,
    setShowImageDialog,
    isFullScreen = false,
    fade = false,
  } = props
  const { iconRef, onTrackMousePosition } = useMousePosition()

  const plugins = []
  if (fade) plugins.push(CarouselFade())

  return (
    <div className="flex-1 w-full h-full" onMouseMove={onTrackMousePosition}>
      <Show when={!isFullScreen}>
        <div
          className="fixed top-0 left-0 z-50 pointer-events-none will-change-transform text-center text-black"
          ref={iconRef}
        >
          <LucideExpand className="mx-auto" />
          <p>Expand</p>
        </div>
      </Show>

      <Show when={isFullScreen}>
        <div
          className="fixed top-0 left-0 z-50 pointer-events-none will-change-transform text-center text-black"
          ref={iconRef}
        >
          <LucideX className="mx-auto" />
          <p>Close</p>
        </div>
      </Show>

      <Carousel
        plugins={plugins}
        setApi={setMainImageCarousel}
        opts={{
          align: 'center',
          watchDrag: false, // disable dragging the main carousel
        }}
        className="w-full h-full"
      >
        <CarouselContent>
          {productImages.map((productImage, index) => (
            <CarouselItem
              key={productImage.id}
              className={cn('basis-full p-2 cursor-pointer', {})}
              onClick={() => setShowImageDialog?.(true)}
            >
              <figure className="h-full w-full border">
                <img
                  loading={index === 0 ? 'eager' : 'lazy'}
                  src={productImage.src}
                  alt={productImage.alt}
                  className="object-cover h-full w-full"
                />
              </figure>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  )
}
