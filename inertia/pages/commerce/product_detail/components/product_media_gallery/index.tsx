import { useState } from 'react'
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/components/ui/carousel'
import { cn } from '~/lib/utils'
import CarouselFade from 'embla-carousel-fade'

export function ProductMediaGallery() {
  const [mainImageCarousel, setMainImageCarousel] = useState<CarouselApi>()
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  const onGoToImage = (newIndex: number) => {
    mainImageCarousel?.scrollTo(newIndex)
    setActiveImageIndex(newIndex)
  }

  const onCycleImage = (role: 'prev' | 'next') => {
    const newIndex =
      role === 'next'
        ? (activeImageIndex + 1) % productImages.length
        : (activeImageIndex - 1 + productImages.length) % productImages.length

    mainImageCarousel?.scrollTo(newIndex)
    setActiveImageIndex(newIndex)
  }

  return (
    <div className="flex gap-4">
      {/* Thumbnails    */}
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
              <figure className="aspect-4/5 w-24 border">
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

        {/* <div className="py-4 relative flex gap-2 justify-center items-center"> */}
        {/*   <CarouselPrevious */}
        {/*     className="static translate-0 cursor-pointer" */}
        {/*     disabled={false} */}
        {/*     onClick={() => onCycleImage('prev')} */}
        {/*   /> */}
        {/*   <CarouselNext */}
        {/*     className="static translate-0 cursor-pointer" */}
        {/*     disabled={false} */}
        {/*     onClick={() => onCycleImage('next')} */}
        {/*   /> */}
        {/* </div> */}
      </Carousel>

      {/* Main Image */}

      <Carousel
        plugins={[CarouselFade()]}
        setApi={setMainImageCarousel}
        opts={{
          align: 'center',
          watchDrag: false, // disable dragging the main carousel
        }}
        className="w-full h-full flex-1"
      >
        <CarouselContent>
          {productImages.map((productImage, index) => (
            <CarouselItem key={productImage.id} className={cn('basis-full p-2 cursor-pointer', {})}>
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

export const productImages = [
  {
    id: 1,
    src: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab',
    alt: 'Front view of oversized black streetwear t-shirt',
  },
  {
    id: 2,
    src: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1',
    alt: 'Model wearing vintage washed denim jacket outdoors',
  },
  {
    id: 3,
    src: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c',
    alt: 'Minimal beige hoodie with relaxed fit',
  },
  {
    id: 4,
    src: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f',
    alt: 'Close-up texture shot of premium cotton fabric',
  },
  {
    id: 5,
    src: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b',
    alt: 'Back view of oversized cream sweatshirt',
  },
  {
    id: 6,
    src: 'https://images.unsplash.com/photo-1483985988355-763728e1935b',
    alt: 'Street fashion outfit with layered neutral clothing',
  },
]
