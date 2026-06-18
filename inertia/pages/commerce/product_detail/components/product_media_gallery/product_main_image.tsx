import { Carousel, type CarouselApi, CarouselContent, CarouselItem } from '~/components/ui/carousel'
import { cn } from '~/lib/utils'
import CarouselFade from 'embla-carousel-fade'

type ProductMainImageProps = {
  productImages: {
    id: number
    src: string
    alt: string
  }[]
  fade?: boolean
  setShowImageDialog?: React.Dispatch<React.SetStateAction<boolean>>
  setMainImageCarousel: React.Dispatch<React.SetStateAction<CarouselApi>>
}

export function ProductMainImage(props: ProductMainImageProps) {
  const { productImages, setMainImageCarousel, setShowImageDialog, fade = false } = props

  const plugins = []
  if (fade) plugins.push(CarouselFade())
  return (
    <Carousel
      plugins={plugins}
      setApi={setMainImageCarousel}
      opts={{
        align: 'center',
        watchDrag: false, // disable dragging the main carousel
      }}
      className="w-full h-full flex-1"
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
  )
}
