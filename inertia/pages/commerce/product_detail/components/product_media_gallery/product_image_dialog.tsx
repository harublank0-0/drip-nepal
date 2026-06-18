import { useEffect, useState } from 'react'
import { type CarouselApi } from '~/components/ui/carousel'
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog'
import { ProductImagesThumbnail } from './product_images_thumbnail'
import { ProductMainImage } from './product_main_image'
import { VisuallyHidden } from 'radix-ui'

type ProductImageDialogProps = {
  initialIndex: number
  open: boolean
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>
  productImages: { id: number; src: string; alt: string }[]
}
export function ProductImageDialog(props: ProductImageDialogProps) {
  const { open, onOpenChange, productImages, initialIndex } = props
  const [activeImageIndex, setActiveImageIndex] = useState(initialIndex)

  const [mainImageCarousel, setMainImageCarousel] = useState<CarouselApi>()

  const onGoToImage = (newIndex: number) => {
    mainImageCarousel?.scrollTo(newIndex)
    setActiveImageIndex(newIndex)
  }

  useEffect(() => {
    if (!mainImageCarousel) return

    mainImageCarousel.scrollTo(activeImageIndex)
  }, [mainImageCarousel, activeImageIndex])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-none w-screen min-h-screen h-screen rounded-none p-0 overflow-y-scroll"
        aria-describedby="dialog-content"
      >
        <VisuallyHidden.VisuallyHidden asChild>
          <DialogTitle>Product Image Detail</DialogTitle>
        </VisuallyHidden.VisuallyHidden>

        <aside className="fixed w-24 top-1/2 left-8 -translate-y-1/2 z-10 self-start shrink-0">
          <ProductImagesThumbnail
            productImages={productImages}
            activeImageIndex={activeImageIndex}
            onGoToImage={onGoToImage}
          />
        </aside>

        <ProductMainImage
          productImages={productImages}
          setMainImageCarousel={setMainImageCarousel}
          setShowImageDialog={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
