import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ImagePlusIcon, XIcon, UploadCloudIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { Show } from '~/components/ui/show'

type ImageUploadProps = {
  value: string | null
  onChange: (value: string | null) => void
  shape?: 'square' | 'wide'
  label: string
  hint?: string
  className?: string
}

export function ImageUpload({
  value,
  onChange,
  shape = 'square',
  label,
  hint,
  className,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (!file || !file.type.startsWith('image/')) return

      const reader = new FileReader()
      reader.onload = () => onChange(reader.result as string)
      reader.readAsDataURL(file)
    },
    [onChange]
  )

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="text-sm font-medium">{label}</span>
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          handleFiles(event.dataTransfer.files)
        }}
        whileTap={{ scale: 0.99 }}
        className={cn(
          'group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-input bg-muted/40 text-center transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          isDragging && 'border-primary bg-primary/5',
          shape === 'square' ? 'size-24' : 'h-28 w-full'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => handleFiles(event.target.files)}
        />

        <Show when={!value}>
          <div className="flex flex-col items-center gap-1.5 px-4 text-muted-foreground">
            {isDragging ? (
              <UploadCloudIcon className="size-5" />
            ) : (
              <ImagePlusIcon className="size-5" />
            )}
            <span className="text-xs font-medium">{isDragging ? 'Drop to upload' : 'Upload'}</span>
          </div>
        </Show>

        <Show when={!!value}>
          <img src={value ?? ''} alt={`${label} preview`} className="size-full object-cover" />
          <div className="absolute inset-0 hidden items-center justify-center gap-1.5 bg-black/50 group-hover:flex">
            <span className="text-xs font-medium text-white">Replace</span>
          </div>
        </Show>
      </motion.div>

      <div className="flex items-center justify-between gap-2">
        <Show when={!!hint}>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </Show>
        <Show when={!!value}>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              onChange(null)
            }}
          >
            <XIcon data-icon="inline-start" />
            Remove
          </Button>
        </Show>
      </div>
    </div>
  )
}
