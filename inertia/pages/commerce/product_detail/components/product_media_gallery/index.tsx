import { useState } from 'react'
import { type CarouselApi } from '~/components/ui/carousel'
import { ProductImageDialog } from './product_image_dialog'
import { ProductImagesThumbnail } from './product_images_thumbnail'
import { ProductMainImage } from './product_main_image'
import { Show } from '~/components/ui/show'

export function ProductMediaGallery() {
  const [mainImageCarousel, setMainImageCarousel] = useState<CarouselApi>()
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [showImageDialog, setShowImageDialog] = useState(false)

  const onGoToImage = (newIndex: number) => {
    mainImageCarousel?.scrollTo(newIndex)
    setActiveImageIndex(newIndex)
  }

  return (
    <>
      <Show when={showImageDialog}>
        <ProductImageDialog
          open={showImageDialog}
          onOpenChange={setShowImageDialog}
          productImages={productImages}
          initialIndex={activeImageIndex}
        />
      </Show>

      <div className="flex gap-4">
        {/* Thumbnails    */}
        <div className="w-24">
          <ProductImagesThumbnail
            productImages={productImages}
            activeImageIndex={activeImageIndex}
            onGoToImage={onGoToImage}
          />
        </div>
        {/* Main Image */}
        <ProductMainImage
          fade
          isFullScreen={false}
          productImages={productImages}
          setShowImageDialog={setShowImageDialog}
          setMainImageCarousel={setMainImageCarousel}
        />
      </div>
    </>
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
