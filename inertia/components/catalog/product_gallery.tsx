import { useRef, useState, type KeyboardEvent } from 'react'
import { t } from '~/lib/i18n'

/*
 * The product page's images (docs/08 §4.3 `ProductGallery`, §9; R1-S part
 * 3d-ii). One large image, and with more than one a toolbar of thumbnail
 * buttons named by their alt text: Left and Right (Home, End) move between
 * them, Enter, Space or a click shows the image. No swipe is needed and
 * nothing moves by itself (SC 2.5.7). Each image keeps a square box, so
 * the page does not shift as it loads. Without a public image store (the
 * tests, a local server) the box is empty.
 */
export type GalleryImage = { alt: string; src: string; srcset: string; color: string | null }

const MAIN_SIZES = '(min-width: 1280px) 600px, (min-width: 768px) 50vw, 100vw'

export function ProductGallery({ media }: { media: GalleryImage[] }) {
  const [shown, setShown] = useState(0)
  const [focus, setFocus] = useState(0)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const current = media[Math.min(shown, media.length - 1)]

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const last = media.length - 1
    const next =
      event.key === 'ArrowRight'
        ? Math.min(focus + 1, last)
        : event.key === 'ArrowLeft'
          ? Math.max(focus - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    setFocus(next)
    buttons.current[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-muted aspect-square overflow-hidden rounded-lg">
        {current && current.src ? (
          <img
            src={current.src}
            srcSet={current.srcset}
            sizes={MAIN_SIZES}
            alt={current.alt}
            fetchPriority="high"
            className="size-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center text-sm">
            {current ? (
              <span className="sr-only">{current.alt}</span>
            ) : (
              t('storefront.product.no_image')
            )}
          </div>
        )}
      </div>
      {media.length > 1 ? (
        <div
          role="toolbar"
          aria-label={t('storefront.product.images')}
          aria-orientation="horizontal"
          className="flex gap-2 overflow-x-auto p-0.5"
          onKeyDown={moveFocus}
        >
          {media.map((image, index) => (
            <button
              key={`${image.src}-${index}`}
              ref={(element) => {
                buttons.current[index] = element
              }}
              type="button"
              tabIndex={index === focus ? 0 : -1}
              aria-pressed={index === shown}
              aria-label={image.alt}
              className="bg-muted focus-visible:ring-ring/50 aria-pressed:ring-primary size-16 shrink-0 overflow-hidden rounded-md outline-none focus-visible:ring-3 aria-pressed:ring-2"
              onFocus={() => setFocus(index)}
              onClick={() => setShown(index)}
            >
              {image.src ? (
                <img
                  src={image.src}
                  srcSet={image.srcset}
                  sizes="64px"
                  alt=""
                  className="size-full object-cover"
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
