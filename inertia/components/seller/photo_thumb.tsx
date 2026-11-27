import { useState } from 'react'
import { imageSources } from '@shared/ui/image_sources'

/*
 * A gallery image (R1-S part 2g-ii): the processed derivatives from the
 * public bucket, else the upload's `blob:` preview, else a plain box. An
 * image that fails to load (a slow or unreachable store) falls back the
 * same way, so the gallery keeps its shape.
 */
export function PhotoThumb({
  keys,
  mediaBase,
  preview,
  alt,
  sizes,
  className,
}: {
  keys: Record<string, string> | null
  mediaBase: string
  preview?: string
  alt: string
  sizes: string
  className: string
}) {
  const [failed, setFailed] = useState(false)
  const sources = keys && !failed ? imageSources(keys, mediaBase) : { src: '', srcset: '' }
  const src = sources.src || preview || ''
  if (!src) return <div className={`bg-muted ${className}`} />
  return (
    <img
      src={src}
      srcSet={sources.src ? sources.srcset : undefined}
      sizes={sizes}
      alt={alt}
      className={`bg-muted ${className}`}
      onError={() => setFailed(true)}
    />
  )
}
