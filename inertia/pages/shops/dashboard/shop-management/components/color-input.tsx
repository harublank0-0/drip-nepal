import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'

type ColorInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}

export function ColorInput({ label, value, onChange, error }: ColorInputProps) {
  const isValid = /^#([0-9a-fA-F]{6})$/.test(value)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <label
          className={cn(
            'relative flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-input ring-offset-background',
            'focus-within:ring-3 focus-within:ring-ring/50'
          )}
          style={{ backgroundColor: isValid ? value : 'transparent' }}
        >
          <input
            type="color"
            value={isValid ? value : '#000000'}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label={`${label} color picker`}
          />
        </label>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={!!error}
          className="font-mono uppercase"
          maxLength={7}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
