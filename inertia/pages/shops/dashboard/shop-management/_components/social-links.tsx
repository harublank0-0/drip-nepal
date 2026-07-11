import {
  AtSignIcon,
  BriefcaseIcon,
  CameraIcon,
  GlobeIcon,
  Music2Icon,
  PinIcon,
  PlayCircleIcon,
  Share2Icon,
  UsersIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Field, FieldError, FieldLabel } from '~/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/components/ui/input-group'
import { SectionCard } from '../components/section-card'
import { useSectionForm } from '../hooks/use-section-form'
import {
  socialLinksSchema,
  type SocialLinks as SocialLinksType,
  type SocialPlatform,
} from '../types'

type SocialLinksProps = {
  value: SocialLinksType
  onChange: (next: SocialLinksType) => void
}

const platformMeta: {
  key: SocialPlatform
  label: string
  icon: LucideIcon
  placeholder: string
}[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    icon: CameraIcon,
    placeholder: 'https://instagram.com/yourshop',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: UsersIcon,
    placeholder: 'https://facebook.com/yourshop',
  },
  { key: 'tiktok', label: 'TikTok', icon: Music2Icon, placeholder: 'https://tiktok.com/@yourshop' },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    icon: BriefcaseIcon,
    placeholder: 'https://linkedin.com/company/yourshop',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    icon: PlayCircleIcon,
    placeholder: 'https://youtube.com/@yourshop',
  },
  {
    key: 'pinterest',
    label: 'Pinterest',
    icon: PinIcon,
    placeholder: 'https://pinterest.com/yourshop',
  },
  { key: 'twitter', label: 'Twitter / X', icon: AtSignIcon, placeholder: 'https://x.com/yourshop' },
  { key: 'website', label: 'Website', icon: GlobeIcon, placeholder: 'https://yourshop.com' },
]

export function SocialLinks({ value, onChange }: SocialLinksProps) {
  const { errors, setField, handleBlur, isInvalid } = useSectionForm(
    value,
    onChange,
    socialLinksSchema
  )

  return (
    <SectionCard
      icon={Share2Icon}
      title="Social Media"
      description="Link your social profiles so shoppers can find and follow you."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {platformMeta.map(({ key, label, icon: Icon, placeholder }) => (
          <Field key={key} data-invalid={isInvalid(key)}>
            <FieldLabel htmlFor={key}>{label}</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <Icon />
              </InputGroupAddon>
              <InputGroupInput
                id={key}
                value={value[key]}
                onBlur={() => handleBlur(key)}
                onChange={(event) => setField(key, event.target.value)}
                placeholder={placeholder}
                aria-invalid={isInvalid(key)}
              />
            </InputGroup>
            <FieldError>{isInvalid(key) ? errors[key] : undefined}</FieldError>
          </Field>
        ))}
      </div>
    </SectionCard>
  )
}
