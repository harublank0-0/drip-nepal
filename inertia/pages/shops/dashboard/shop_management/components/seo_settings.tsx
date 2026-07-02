import { useMemo } from 'react'
import { CheckCircle2Icon, CircleIcon, GaugeIcon, SearchIcon } from 'lucide-react'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Progress } from '~/components/ui/progress'
import { cn } from '~/lib/utils'
import { SectionCard } from './shared/section_card'
import { ImageUpload } from './shared/image_upload'
import { useSectionForm } from '../use_section_form'
import { seoSettingsSchema, type SeoSettings as SeoSettingsType } from '../types'

type SeoSettingsProps = {
  value: SeoSettingsType
  onChange: (next: SeoSettingsType) => void
  storeSlug: string
}

export function SeoSettings({ value, onChange, storeSlug }: SeoSettingsProps) {
  const { errors, setField, handleBlur, isInvalid } = useSectionForm(
    value,
    onChange,
    seoSettingsSchema
  )

  const checklist = useMemo(
    () => [
      {
        label: 'Meta title between 30-60 characters',
        done: value.metaTitle.length >= 30 && value.metaTitle.length <= 60,
      },
      {
        label: 'Meta description between 70-160 characters',
        done: value.metaDescription.length >= 70 && value.metaDescription.length <= 160,
      },
      {
        label: 'At least 3 keywords added',
        done: (value.keywords ?? '').split(',').filter(Boolean).length >= 3,
      },
      { label: 'Open Graph image uploaded', done: !!value.ogImage },
    ],
    [value]
  )

  const score = Math.round((checklist.filter((item) => item.done).length / checklist.length) * 100)
  const scoreLabel = score >= 80 ? 'Excellent' : score >= 50 ? 'Needs work' : 'Poor'
  const scoreColor =
    score >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : score >= 50
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-destructive'

  return (
    <SectionCard
      id="seo"
      icon={SearchIcon}
      title="SEO Settings"
      description="Control how your store appears in search engines and social previews."
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <FieldGroup>
          <Field data-invalid={isInvalid('metaTitle')}>
            <FieldLabel htmlFor="metaTitle">Meta Title</FieldLabel>
            <Input
              id="metaTitle"
              value={value.metaTitle}
              onBlur={() => handleBlur('metaTitle')}
              onChange={(event) => setField('metaTitle', event.target.value)}
              aria-invalid={isInvalid('metaTitle')}
            />
            <div className="flex items-center justify-between">
              <FieldError>{isInvalid('metaTitle') ? errors.metaTitle : undefined}</FieldError>
              <span className="text-xs text-muted-foreground">{value.metaTitle.length}/60</span>
            </div>
          </Field>

          <Field data-invalid={isInvalid('metaDescription')}>
            <FieldLabel htmlFor="metaDescription">Meta Description</FieldLabel>
            <Textarea
              id="metaDescription"
              rows={3}
              value={value.metaDescription}
              onBlur={() => handleBlur('metaDescription')}
              onChange={(event) => setField('metaDescription', event.target.value)}
              aria-invalid={isInvalid('metaDescription')}
            />
            <div className="flex items-center justify-between">
              <FieldError>
                {isInvalid('metaDescription') ? errors.metaDescription : undefined}
              </FieldError>
              <span className="text-xs text-muted-foreground">
                {value.metaDescription.length}/160
              </span>
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="keywords">Keywords</FieldLabel>
            <Input
              id="keywords"
              value={value.keywords ?? ''}
              onChange={(event) => setField('keywords', event.target.value)}
              placeholder="nepali streetwear, handmade accessories"
            />
            <FieldDescription>Separate keywords with commas.</FieldDescription>
          </Field>

          <ImageUpload
            label="Open Graph Image"
            hint="Shown when your store is shared on social media, 1200×630px"
            shape="wide"
            value={value.ogImage}
            onChange={(next) => setField('ogImage', next)}
          />
        </FieldGroup>

        <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Google Search Preview</p>
            <div className="rounded-lg border p-3">
              <p className="truncate text-xs text-muted-foreground">drip-nepal.com › {storeSlug}</p>
              <p className="mt-0.5 truncate text-base text-[#1a0dab] dark:text-[#8ab4f8]">
                {value.metaTitle || 'Your meta title appears here'}
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                {value.metaDescription || 'Your meta description appears here.'}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Store URL Preview</p>
            <div className="truncate rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">
              drip-nepal.com/{storeSlug}
            </div>
          </div>

          <div className="rounded-lg border p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <GaugeIcon className="size-4" />
                SEO Score
              </span>
              <span className={cn('text-sm font-semibold', scoreColor)}>
                {score}/100 · {scoreLabel}
              </span>
            </div>
            <Progress value={score} className="mb-3" />
            <ul className="flex flex-col gap-1.5">
              {checklist.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  {item.done ? (
                    <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <CircleIcon className="size-3.5 shrink-0" />
                  )}
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
