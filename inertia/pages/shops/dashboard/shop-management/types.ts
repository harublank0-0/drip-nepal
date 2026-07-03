import { z } from 'zod'

export const StoreStatusValues = ['active', 'draft', 'suspended', 'under_review'] as const
export type StoreStatus = (typeof StoreStatusValues)[number]

export const PlanValues = ['starter', 'growth', 'pro', 'enterprise'] as const
export type Plan = (typeof PlanValues)[number]

export const ThemeModeValues = ['light', 'dark', 'auto'] as const
export type ThemeMode = (typeof ThemeModeValues)[number]

export const ButtonStyleValues = ['solid', 'outline', 'soft'] as const
export type ButtonStyleOption = (typeof ButtonStyleValues)[number]

export const WeekDays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const
export type WeekDay = (typeof WeekDays)[number]

export const InsightPriority = ['high', 'medium', 'low'] as const
export type InsightPriorityLevel = (typeof InsightPriority)[number]

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export type ShopOverview = {
  id: string
  name: string
  slug: string
  logo: string | null
  banner: string | null
  isVerified: boolean
  plan: Plan
  status: StoreStatus
  rating: number
  reviewCount: number
  totalProducts: number
  followers: number
  totalSales: number
  joinedAt: string
}

export const shopInformationSchema = z.object({
  storeName: z.string().trim().min(2, 'Store name must be at least 2 characters').max(100),
  storeSlug: z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers and hyphens are allowed'),
  businessDescription: z.string().trim().max(1000, 'Keep it under 1000 characters').optional(),
  tagline: z.string().trim().max(120, 'Keep it under 120 characters').optional(),
  supportEmail: z.email('Enter a valid email address'),
  phoneNumber: z.string().trim().min(7, 'Enter a valid phone number').max(20),
  website: z.union([z.url('Enter a valid URL'), z.literal('')]).optional(),
  businessRegistrationNumber: z.string().trim().max(60).optional(),
  taxId: z.string().trim().max(60).optional(),
  businessCategory: z.string().trim().min(1, 'Select a business category'),
  country: z.string().trim().min(1, 'Select a country'),
  state: z.string().trim().min(1, 'State / province is required'),
  city: z.string().trim().min(1, 'City is required'),
  address: z.string().trim().min(3, 'Address is required'),
  postalCode: z.string().trim().min(2, 'Postal code is required'),
  timezone: z.string().trim().min(1, 'Select a timezone'),
  currency: z.string().trim().min(1, 'Select a currency'),
  language: z.string().trim().min(1, 'Select a language'),
})
export type ShopInformation = z.infer<typeof shopInformationSchema>

export const brandingSchema = z.object({
  logo: z.string().nullable(),
  banner: z.string().nullable(),
  primaryColor: z.string().regex(/^#([0-9a-fA-F]{6})$/, 'Use a valid hex color'),
  secondaryColor: z.string().regex(/^#([0-9a-fA-F]{6})$/, 'Use a valid hex color'),
  accentColor: z.string().regex(/^#([0-9a-fA-F]{6})$/, 'Use a valid hex color'),
  buttonStyle: z.enum(ButtonStyleValues),
  cornerRadius: z.number().min(0).max(24),
  fontPairing: z.string().min(1),
  themeMode: z.enum(ThemeModeValues),
})
export type Branding = z.infer<typeof brandingSchema>

export const dayScheduleSchema = z.object({
  open: z.string(),
  close: z.string(),
  closed: z.boolean(),
})
export type DaySchedule = z.infer<typeof dayScheduleSchema>

export const businessHoursSchema = z.object({
  schedule: z.record(z.enum(WeekDays), dayScheduleSchema),
  holidayMode: z.boolean(),
  vacationMode: z.boolean(),
  vacationRange: z
    .object({
      from: z.string().nullable(),
      to: z.string().nullable(),
    })
    .optional(),
  temporarilyClosed: z.boolean(),
})
export type BusinessHours = z.infer<typeof businessHoursSchema>

export const shippingRegionSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Region name is required'),
  flatRate: z.number().min(0, 'Must be 0 or more'),
  enabled: z.boolean(),
})
export type ShippingRegion = z.infer<typeof shippingRegionSchema>

export const shippingSettingsSchema = z.object({
  regions: z.array(shippingRegionSchema).min(1, 'Add at least one shipping region'),
  freeShippingThreshold: z.number().min(0, 'Must be 0 or more'),
  processingTime: z.string().min(1, 'Select a processing time'),
  handlingFee: z.number().min(0, 'Must be 0 or more'),
  defaultCourier: z.string().min(1, 'Select a default courier'),
  notes: z.string().max(500).optional(),
})
export type ShippingSettings = z.infer<typeof shippingSettingsSchema>

export type PaymentMethodKey = 'stripe' | 'paypal' | 'bank_transfer' | 'cod'

export type PaymentMethod = {
  key: PaymentMethodKey
  label: string
  description: string
  connected: boolean
  verified: boolean
}

export type PaymentSettingsState = Record<PaymentMethodKey, PaymentMethod>

export type NotificationChannels = {
  email: boolean
  sms: boolean
  push: boolean
}

export type NotificationPreferences = {
  orderNotifications: NotificationChannels
  lowInventoryAlerts: boolean
  newReviewAlerts: boolean
  customerMessages: boolean
  marketingUpdates: boolean
  securityAlerts: boolean
}

export const policyKeys = [
  'privacyPolicy',
  'refundPolicy',
  'returnPolicy',
  'shippingPolicy',
  'termsAndConditions',
] as const
export type PolicyKey = (typeof policyKeys)[number]
export type StorePolicies = Record<PolicyKey, string>

export const seoSettingsSchema = z.object({
  metaTitle: z.string().trim().min(1, 'Meta title is required').max(60, 'Keep under 60 characters'),
  metaDescription: z
    .string()
    .trim()
    .min(1, 'Meta description is required')
    .max(160, 'Keep under 160 characters'),
  keywords: z.string().trim().max(250).optional(),
  ogImage: z.string().nullable(),
})
export type SeoSettings = z.infer<typeof seoSettingsSchema>

const optionalUrl = z.union([z.url('Enter a valid URL'), z.literal('')])

export const socialLinksSchema = z.object({
  instagram: optionalUrl,
  facebook: optionalUrl,
  tiktok: optionalUrl,
  linkedin: optionalUrl,
  youtube: optionalUrl,
  pinterest: optionalUrl,
  twitter: optionalUrl,
  website: optionalUrl,
})
export type SocialLinks = z.infer<typeof socialLinksSchema>
export type SocialPlatform = keyof SocialLinks

export type AnalyticsMetric = {
  key: string
  label: string
  value: string
  delta: number
  trend: number[]
}

export type PerformanceInsight = {
  id: string
  issue: string
  description: string
  priority: InsightPriorityLevel
  actionLabel: string
  count?: number
}

export type ApiKey = {
  id: string
  label: string
  lastUsed: string
  createdAt: string
  maskedKey: string
}

export type ConnectedApp = {
  id: string
  name: string
  description: string
  connectedAt: string
  icon: string
}

export type LoginDevice = {
  id: string
  device: string
  location: string
  lastActive: string
  current: boolean
  browser: string
}

export type SecuritySettingsState = {
  twoFactorEnabled: boolean
  apiKeys: ApiKey[]
  connectedApps: ConnectedApp[]
  devices: LoginDevice[]
}

export type ShopManagementData = {
  overview: ShopOverview
  information: ShopInformation
  branding: Branding
  businessHours: BusinessHours
  shipping: ShippingSettings
  payments: PaymentSettingsState
  notifications: NotificationPreferences
  policies: StorePolicies
  seo: SeoSettings
  social: SocialLinks
  analytics: AnalyticsMetric[]
  insights: PerformanceInsight[]
  security: SecuritySettingsState
}

export type SectionId =
  | 'overview'
  | 'information'
  | 'branding'
  | 'hours'
  | 'shipping'
  | 'payments'
  | 'notifications'
  | 'policies'
  | 'seo'
  | 'social'
  | 'analytics'
  | 'insights'
  | 'security'
  | 'danger'
