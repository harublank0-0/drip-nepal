import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { VisuallyHidden } from 'radix-ui'
import { ChevronLeft, ChevronRight, ImageIcon, X, ZoomIn } from 'lucide-react'
import type { Data } from '@generated/data'
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog'
import { cn } from '~/lib/utils'

type GalleryImage = {
  id: string
  src: string
  thumbnail: string
  alt: string
}

type ProductGalleryProps = {
  media: Data.ProductMedia[] | undefined
  productName: string
}

const SWIPE_THRESHOLD = 40

function toGalleryImages(media: Data.ProductMedia[], productName: string): GalleryImage[] {
  return [...media]
    .sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity))
    .map((item, index) => ({
      id: item.id,
      src: item.url,
      thumbnail: item.thumbnailUrl ?? item.url,
      alt: item.altText || `${productName}, photo ${index + 1}`,
    }))
}

function zoomAt(event: React.MouseEvent<HTMLDivElement>, img: HTMLImageElement | null) {
  if (!img || !window.matchMedia('(hover: hover) and (min-width: 768px)').matches) return
  const rect = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * 100
  const y = ((event.clientY - rect.top) / rect.height) * 100
  img.style.transformOrigin = `${x}% ${y}%`
  img.style.transform = 'scale(1.8)'
}

function resetZoom(img: HTMLImageElement | null) {
  if (!img) return
  img.style.transform = 'scale(1)'
  img.style.transformOrigin = '50% 50%'
}

export function ProductGallery({ media, productName }: ProductGalleryProps) {
  const images = toGalleryImages(media ?? [], productName)
  const [activeIndex, setActiveIndex] = useState(0)
  const [showFullscreen, setShowFullscreen] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const touchStartX = useRef<number | null>(null)

  const hasMany = images.length > 1
  const showPrevious = () => setActiveIndex((i) => (i === 0 ? images.length - 1 : i - 1))
  const showNext = () => setActiveIndex((i) => (i === images.length - 1 ? 0 : i + 1))

  useEffect(() => {
    if (!showFullscreen || images.length < 2) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        setActiveIndex((i) => (i === 0 ? images.length - 1 : i - 1))
      } else if (event.key === 'ArrowRight') {
        setActiveIndex((i) => (i === images.length - 1 ? 0 : i + 1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showFullscreen, images.length])

  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 rounded-2xl bg-muted text-muted-foreground">
        <ImageIcon className="size-10 opacity-50" aria-hidden="true" />
        <p className="text-sm">No photos yet</p>
      </div>
    )
  }

  const active = images[Math.min(activeIndex, images.length - 1)]

  return (
    <>
      <div className="flex flex-col-reverse gap-3 md:flex-row md:gap-4">
        {hasMany && (
          <div className="flex gap-2 overflow-x-auto p-1 md:max-h-[640px] md:flex-col md:overflow-x-hidden md:overflow-y-auto">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={cn(
                  'size-16 shrink-0 overflow-hidden rounded-lg ring-1 transition-all duration-200 md:size-20',
                  active.id === image.id
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : 'ring-foreground/10 hover:ring-foreground/30'
                )}
                aria-label={`Show photo ${index + 1} of ${images.length}`}
                aria-current={active.id === image.id}
              >
                <img
                  src={image.thumbnail}
                  alt=""
                  className="size-full object-cover"
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
              </button>
            ))}
          </div>
        )}

        <div
          className="group relative aspect-[4/5] flex-1 cursor-zoom-in overflow-hidden rounded-2xl bg-muted"
          onMouseMove={(event) => zoomAt(event, imgRef.current)}
          onMouseLeave={() => resetZoom(imgRef.current)}
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0].clientX
          }}
          onTouchEnd={(event) => {
            if (!hasMany || touchStartX.current === null) return
            const deltaX = event.changedTouches[0].clientX - touchStartX.current
            touchStartX.current = null
            if (deltaX > SWIPE_THRESHOLD) showPrevious()
            else if (deltaX < -SWIPE_THRESHOLD) showNext()
          }}
          onClick={() => setShowFullscreen(true)}
          role="button"
          tabIndex={0}
          aria-label="Open photo in fullscreen"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setShowFullscreen(true)
            }
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.img
              key={active.id}
              ref={imgRef}
              src={active.src}
              alt={active.alt}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="size-full object-cover transition-transform duration-200 ease-out will-change-transform"
              loading="eager"
              draggable={false}
            />
          </AnimatePresence>

          <span className="pointer-events-none absolute top-4 right-4 hidden items-center gap-1 rounded-full bg-background/80 px-3 py-1.5 text-xs font-medium opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 md:flex">
            <ZoomIn className="size-3.5" aria-hidden="true" />
            Zoom
          </span>
        </div>
      </div>

      <Dialog open={showFullscreen} onOpenChange={setShowFullscreen}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="h-dvh max-h-dvh w-screen max-w-none rounded-none bg-black/95 p-0 sm:max-w-none"
        >
          <VisuallyHidden.Root asChild>
            <DialogTitle>{productName} photos</DialogTitle>
          </VisuallyHidden.Root>

          <button
            type="button"
            onClick={() => setShowFullscreen(false)}
            className="absolute top-4 right-4 z-20 flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 md:top-6 md:right-6"
            aria-label="Close fullscreen"
          >
            <X className="size-5" />
          </button>

          <div className="flex h-full items-center gap-6 px-4 md:px-12">
            {hasMany && (
              <div className="hidden max-h-[70vh] shrink-0 flex-col gap-2 overflow-y-auto p-1 md:flex">
                {images.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      'h-20 w-16 shrink-0 overflow-hidden rounded-lg ring-1 transition-all duration-200',
                      active.id === image.id
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-black'
                        : 'ring-white/20 hover:ring-white/50'
                    )}
                    aria-label={`Show photo ${index + 1} of ${images.length}`}
                    aria-current={active.id === image.id}
                  >
                    <img src={image.thumbnail} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 md:gap-4">
              {hasMany && (
                <button
                  type="button"
                  onClick={showPrevious}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 md:size-12"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="size-5" />
                </button>
              )}

              <AnimatePresence mode="wait" initial={false}>
                <motion.img
                  key={active.id}
                  src={active.src}
                  alt={active.alt}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.25 }}
                  className="max-h-[80vh] min-w-0 max-w-full rounded-lg object-contain"
                />
              </AnimatePresence>

              {hasMany && (
                <button
                  type="button"
                  onClick={showNext}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 md:size-12"
                  aria-label="Next photo"
                >
                  <ChevronRight className="size-5" />
                </button>
              )}
            </div>
          </div>

          {hasMany && (
            <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm text-white/70">
              {Math.min(activeIndex, images.length - 1) + 1} / {images.length}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
