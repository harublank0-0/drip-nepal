import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'

type SlugInputProps = {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  isInvalid?: boolean
  error?: string
  shopName: string
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export function SlugInput({ value, onChange, onBlur, isInvalid, error, shopName }: SlugInputProps) {
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-sm text-muted-foreground">
          dripnepal.com/
        </span>
        <Input
          id="shopSlug"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="your-shop"
          aria-invalid={isInvalid}
          aria-describedby={error ? 'slug-error' : undefined}
          className={cn(
            'pl-[9.5rem]',
            isInvalid && 'border-destructive ring-3 ring-destructive/20 dark:ring-destructive/40'
          )}
        />
      </div>
      {shopName && !value && (
        <p className="text-xs text-muted-foreground">
          Auto-generated: {generateSlug(shopName) || 'your-shop'}
        </p>
      )}
      {error && (
        <p id="slug-error" className="text-sm font-normal text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export { generateSlug }
