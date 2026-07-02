import {
  BellIcon,
  MailIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  PackageSearchIcon,
  ShieldAlertIcon,
  SmartphoneIcon,
  StarIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Switch } from '~/components/ui/switch'
import { Separator } from '~/components/ui/separator'
import { SectionCard } from './shared/section_card'
import type { NotificationChannels, NotificationPreferences } from '../types'

type NotificationSettingsProps = {
  value: NotificationPreferences
  onChange: (next: NotificationPreferences) => void
}

const channelMeta: { key: keyof NotificationChannels; label: string; icon: LucideIcon }[] = [
  { key: 'email', label: 'Email', icon: MailIcon },
  { key: 'sms', label: 'SMS', icon: SmartphoneIcon },
  { key: 'push', label: 'Push', icon: BellIcon },
]

const toggleMeta: {
  key: keyof Omit<NotificationPreferences, 'orderNotifications'>
  label: string
  description: string
  icon: LucideIcon
}[] = [
  {
    key: 'lowInventoryAlerts',
    label: 'Low Inventory Alerts',
    description: 'Get notified when a product drops below its stock threshold.',
    icon: PackageSearchIcon,
  },
  {
    key: 'newReviewAlerts',
    label: 'New Review Alerts',
    description: 'A shopper leaves a new product review.',
    icon: StarIcon,
  },
  {
    key: 'customerMessages',
    label: 'Customer Messages',
    description: 'Direct messages and support requests from customers.',
    icon: MessageSquareIcon,
  },
  {
    key: 'marketingUpdates',
    label: 'Marketing Updates',
    description: 'Platform tips, feature announcements, and best practices.',
    icon: MegaphoneIcon,
  },
  {
    key: 'securityAlerts',
    label: 'Security Alerts',
    description: 'Sign-ins from new devices and suspicious activity.',
    icon: ShieldAlertIcon,
  },
]

export function NotificationSettings({ value, onChange }: NotificationSettingsProps) {
  const setChannel = (key: keyof NotificationChannels, checked: boolean) => {
    onChange({
      ...value,
      orderNotifications: { ...value.orderNotifications, [key]: checked },
    })
  }

  const setToggle = (
    key: keyof Omit<NotificationPreferences, 'orderNotifications'>,
    checked: boolean
  ) => {
    onChange({ ...value, [key]: checked })
  }

  return (
    <SectionCard
      id="notifications"
      icon={BellIcon}
      title="Notification Preferences"
      description="Choose how and when you want to hear from us and your customers."
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border p-3.5">
          <p className="mb-3 text-sm font-medium">Order Notifications</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {channelMeta.map(({ key, label, icon: Icon }) => (
              <label
                key={key}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Icon className="size-4 text-muted-foreground" />
                  {label}
                </span>
                <Switch
                  size="sm"
                  checked={value.orderNotifications[key]}
                  onCheckedChange={(checked) => setChannel(key, checked)}
                />
              </label>
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-1">
          {toggleMeta.map(({ key, label, description, icon: Icon }) => (
            <label
              key={key}
              className="flex items-start justify-between gap-4 rounded-lg px-2 py-2.5"
            >
              <span className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-sm text-muted-foreground">{description}</span>
                </span>
              </span>
              <Switch checked={value[key]} onCheckedChange={(checked) => setToggle(key, checked)} />
            </label>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}
