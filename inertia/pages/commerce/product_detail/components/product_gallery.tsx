import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Carousel, CarouselContent, CarouselItem } from '~/components/ui/carousel'
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog'
import { VisuallyHidden } from 'radix-ui'
import { cn } from '~/lib/utils'
import type { ProductImage } from '../mock'

const zoomImage = (
  e: React.MouseEvent<HTMLDivElement>,
  container: HTMLDivElement | null,
  img: HTMLImageElement | null
) => {
  if (!container || !img) return
  const rect = container.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * 100
  const y = ((e.clientY - rect.top) / rect.height) * 100
  img.style.transformOrigin = `${x}% ${y}%`
}

type ProductGalleryProps = {
  images: ProductImage[]
}

export function ProductGallery({ images }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [showFullscreen, setShowFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!showFullscreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
      } else if (e.key === 'ArrowRight') {
        setActiveIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showFullscreen, images.length])

  return (
    <>
      <div className="flex flex-col-reverse md:flex-row gap-3 md:gap-4">
        {/* Thumbnails — horizontal on mobile, vertical on desktop */}
        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto md:max-h-[600px] scrollbar-thin">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setActiveIndex(i)}
              className={cn(
                'flex-shrink-0 w-16 md:w-20 h-16 md:h-20 rounded-lg overflow-hidden ring-1 transition-all duration-200',
                activeIndex === i
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : 'ring-foreground/10 hover:ring-foreground/30'
              )}
              aria-label={`View ${img.alt}`}
            >
              <img
                src={img.src}
                alt={img.alt}
                className="w-full h-full object-cover"
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            </button>
          ))}
        </div>

        {/* Main Image with zoom */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden rounded-2xl bg-muted aspect-[4/5] md:aspect-auto md:min-h-[600px] cursor-crosshair group"
          onMouseMove={(e) => {
            if (window.innerWidth >= 768) zoomImage(e, containerRef.current, imgRef.current)
            if (window.innerWidth >= 768) {
              const img = imgRef.current
              if (img) img.style.transform = 'scale(1.8)'
            }
          }}
          onMouseLeave={() => {
            const img = imgRef.current
            if (img) {
              img.style.transform = 'scale(1)'
              img.style.transformOrigin = '50% 50%'
            }
          }}
          onClick={() => setShowFullscreen(true)}
          role="button"
          tabIndex={0}
          aria-label="Open fullscreen image"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setShowFullscreen(true)
          }}
        >
          <AnimatePresence mode="wait">
            <motion.img
              key={activeIndex}
              src={images[activeIndex].src}
              alt={images[activeIndex].alt}
              ref={imgRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full object-cover transition-transform duration-200 ease-out will-change-transform"
              loading="eager"
            />
          </AnimatePresence>

          <div className="absolute top-4 right-4 bg-background/80 backdrop-blur-sm rounded-full px-3 py-1.5 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 md:flex hidden items-center gap-1">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
              <path d="M11 8v6" />
              <path d="M8 11h6" />
            </svg>
            Zoom
          </div>
        </div>
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={showFullscreen} onOpenChange={setShowFullscreen}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-none w-screen h-screen max-h-screen rounded-none p-0 bg-black/95"
        >
          <VisuallyHidden.VisuallyHidden asChild>
            <DialogTitle>Product Image</DialogTitle>
          </VisuallyHidden.VisuallyHidden>

          <button
            onClick={() => setShowFullscreen(false)}
            className="absolute top-6 right-6 z-20 size-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            aria-label="Close fullscreen"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>

          <div className="flex h-full items-center gap-6 px-6 md:px-12">
            {/* Thumbnails — left column, desktop only */}
            <div className="hidden md:flex flex-col gap-2 overflow-y-auto max-h-[70vh] flex-shrink-0 scrollbar-thin">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActiveIndex(i)}
                  className={cn(
                    'flex-shrink-0 w-16 h-20 rounded-lg overflow-hidden ring-1 transition-all duration-200',
                    activeIndex === i
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-black/95'
                      : 'ring-white/20 hover:ring-white/50'
                  )}
                  aria-label={`View ${img.alt}`}
                >
                  <img
                    src={img.src}
                    alt={img.alt}
                    className="w-full h-full object-cover"
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                </button>
              ))}
            </div>

            {/* Main image area */}
            <div className="flex items-center gap-4 flex-1 min-w-0 justify-center">
              <button
                onClick={() => setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))}
                className="size-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors flex-shrink-0"
                aria-label="Previous image"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>

              <AnimatePresence mode="wait">
                <motion.img
                  key={activeIndex}
                  src={images[activeIndex].src}
                  alt={images[activeIndex].alt}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="max-h-[80vh] max-w-full object-contain rounded-lg"
                />
              </AnimatePresence>

              <button
                onClick={() => setActiveIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))}
                className="size-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors flex-shrink-0"
                aria-label="Next image"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Dots — mobile only */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 md:hidden">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={cn(
                  'size-2 rounded-full transition-all duration-200',
                  i === activeIndex ? 'bg-white w-6' : 'bg-white/40 hover:bg-white/60'
                )}
                aria-label={`Go to image ${i + 1}`}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
