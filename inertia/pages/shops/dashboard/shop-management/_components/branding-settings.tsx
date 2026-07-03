import { PaletteIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '~/components/ui/field'
import { Slider } from '~/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group'
import { Separator } from '~/components/ui/separator'
import { cn } from '~/lib/utils'
import { SectionCard } from '../components/section-card'
import { ImageUpload } from '../components/image-upload'
import { ColorInput } from '../components/color-input'
import { fontPairingOptions } from '../constants'
import type { Branding } from '../types'

type BrandingSettingsProps = {
  value: Branding
  onChange: (next: Branding) => void
}

export function BrandingSettings({ value, onChange }: BrandingSettingsProps) {
  const setField = <K extends keyof Branding>(key: K, fieldValue: Branding[K]) =>
    onChange({ ...value, [key]: fieldValue })

  const radius = value.cornerRadius

  return (
    <SectionCard
      icon={PaletteIcon}
      title="Branding"
      description="Customize how your storefront looks to shoppers. Preview updates instantly."
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ImageUpload
              label="Logo"
              hint="Square, at least 256×256px"
              shape="square"
              value={value.logo}
              onChange={(next) => setField('logo', next)}
            />
            <ImageUpload
              label="Banner"
              hint="Wide, at least 1600×400px"
              shape="wide"
              value={value.banner}
              onChange={(next) => setField('banner', next)}
              className="sm:col-span-1"
            />
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ColorInput
              label="Primary Color"
              value={value.primaryColor}
              onChange={(next) => setField('primaryColor', next)}
            />
            <ColorInput
              label="Secondary Color"
              value={value.secondaryColor}
              onChange={(next) => setField('secondaryColor', next)}
            />
            <ColorInput
              label="Accent Color"
              value={value.accentColor}
              onChange={(next) => setField('accentColor', next)}
            />
          </div>

          <Separator />

          <Field>
            <FieldLabel>Button Style</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={value.buttonStyle}
              onValueChange={(next) =>
                next && setField('buttonStyle', next as Branding['buttonStyle'])
              }
            >
              <ToggleGroupItem value="solid">Solid</ToggleGroupItem>
              <ToggleGroupItem value="outline">Outline</ToggleGroupItem>
              <ToggleGroupItem value="soft">Soft</ToggleGroupItem>
            </ToggleGroup>
          </Field>

          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="cornerRadius">Corner Radius</FieldLabel>
              <span className="text-sm text-muted-foreground">{radius}px</span>
            </div>
            <Slider
              id="cornerRadius"
              min={0}
              max={24}
              step={2}
              value={[radius]}
              onValueChange={([next]) => setField('cornerRadius', next)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="fontPairing">Typography</FieldLabel>
            <Select
              value={value.fontPairing}
              onValueChange={(next) => setField('fontPairing', next)}
            >
              <SelectTrigger id="fontPairing" className="w-full">
                <SelectValue placeholder="Select typography" />
              </SelectTrigger>
              <SelectContent>
                {fontPairingOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Applied across your storefront headings and body text.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Store Theme</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={value.themeMode}
              onValueChange={(next) => next && setField('themeMode', next as Branding['themeMode'])}
            >
              <ToggleGroupItem value="light">
                <SunIcon data-icon="inline-start" />
                Light
              </ToggleGroupItem>
              <ToggleGroupItem value="dark">
                <MoonIcon data-icon="inline-start" />
                Dark
              </ToggleGroupItem>
              <ToggleGroupItem value="auto">
                <MonitorIcon data-icon="inline-start" />
                Auto
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </FieldGroup>

        <BrandingPreview value={value} />
      </div>
    </SectionCard>
  )
}

function BrandingPreview({ value }: { value: Branding }) {
  const isDark = value.themeMode === 'dark'
  const buttonClass = {
    solid: 'text-white',
    outline: 'border-2 bg-transparent',
    soft: '',
  }[value.buttonStyle]

  return (
    <div className="lg:sticky lg:top-24 lg:self-start">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Live Preview</p>
      <div
        className={cn(
          'overflow-hidden rounded-xl border shadow-sm transition-colors',
          isDark ? 'bg-zinc-950 text-zinc-50' : 'bg-white text-zinc-900'
        )}
        style={{ borderRadius: `${value.cornerRadius + 4}px` }}
      >
        <div
          className="h-16 w-full"
          style={{
            background: `linear-gradient(135deg, ${value.primaryColor}, ${value.secondaryColor})`,
          }}
        />
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <div
              className="flex size-8 shrink-0 items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: value.primaryColor, borderRadius: value.cornerRadius }}
            >
              {value.logo ? (
                <img
                  src={value.logo}
                  alt="Logo preview"
                  className="size-full object-cover"
                  style={{ borderRadius: value.cornerRadius }}
                />
              ) : (
                'K'
              )}
            </div>
            <div className="space-y-0.5">
              <p
                className="text-sm leading-none font-semibold"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Kathmandu Threads
              </p>
              <p className="text-xs opacity-60">Storefront preview</p>
            </div>
          </div>

          <div
            className={cn('h-16 w-full', isDark ? 'bg-zinc-900' : 'bg-zinc-100')}
            style={{ borderRadius: value.cornerRadius }}
          />

          <button
            type="button"
            className={cn('h-8 w-full text-sm font-medium transition-colors', buttonClass)}
            style={{
              borderRadius: value.cornerRadius,
              backgroundColor: value.buttonStyle === 'solid' ? value.primaryColor : 'transparent',
              borderColor: value.buttonStyle === 'outline' ? value.primaryColor : 'transparent',
              color:
                value.buttonStyle === 'outline'
                  ? value.primaryColor
                  : value.buttonStyle === 'soft'
                    ? value.primaryColor
                    : undefined,
              background: value.buttonStyle === 'soft' ? `${value.accentColor}22` : undefined,
            }}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
}
