import { Carousel, CarouselContent, CarouselItem } from '~/components/ui/carousel'
import { cn } from '~/lib/utils'

type ProductImagesThumbnail = {
  productImages: { alt: string; src: string; id: number }[]
  activeImageIndex: number
  onGoToImage: (newIndex: number) => void
}

export function ProductImagesThumbnail(props: ProductImagesThumbnail) {
  const { productImages, activeImageIndex, onGoToImage } = props

  return (
    <Carousel orientation="vertical" className="" opts={{}}>
      <CarouselContent className="">
        {productImages.map((productImage, index) => (
          <CarouselItem
            role="button"
            key={productImage.id}
            className={cn('basis-1/5 p-0 cursor-pointer first:mt-0 mt-2', {
              'border-2 border-white': activeImageIndex === index,
            })}
            onMouseEnter={() => onGoToImage(index)}
            onClick={() => onGoToImage(index)}
          >
            <figure className="aspect-4/5 w-full border">
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
