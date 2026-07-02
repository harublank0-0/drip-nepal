import type {
  AnalyticsMetric,
  BusinessHours,
  PaymentSettingsState,
  PerformanceInsight,
  SecuritySettingsState,
  ShopManagementData,
  StorePolicies,
  WeekDay,
} from './types'
import { WeekDays } from './types'

/**
 * Builds a fresh copy of the mock shop management dataset every time it's
 * requested so components never accidentally mutate a shared reference.
 */
export function createMockShopData(): ShopManagementData {
  return {
    overview: {
      id: 'shop_01hz9y1',
      name: 'Kathmandu Threads',
      slug: 'kathmandu-threads',
      logo: null,
      banner: null,
      isVerified: true,
      plan: 'growth',
      status: 'active',
      rating: 4.8,
      reviewCount: 1284,
      totalProducts: 342,
      followers: 18420,
      totalSales: 4218900,
      joinedAt: '2023-02-14T00:00:00.000Z',
    },
    information: {
      storeName: 'Kathmandu Threads',
      storeSlug: 'kathmandu-threads',
      businessDescription:
        'Contemporary streetwear and handcrafted accessories designed in Kathmandu, made for everyday movement. We work directly with local artisans and small-batch manufacturers.',
      tagline: 'Wear the city. Move the culture.',
      supportEmail: 'hello@kathmanduthreads.com',
      phoneNumber: '+977 981-234-5678',
      website: 'https://kathmanduthreads.com',
      businessRegistrationNumber: 'REG-2081-004512',
      taxId: 'PAN-609284173',
      businessCategory: 'custom-and-handmade',
      country: 'Nepal',
      state: 'Bagmati Province',
      city: 'Kathmandu',
      address: 'Jhamsikhel Marg, House 12',
      postalCode: '44600',
      timezone: 'Asia/Kathmandu',
      currency: 'NPR',
      language: 'en',
    },
    branding: {
      logo: null,
      banner: null,
      primaryColor: '#a8324f',
      secondaryColor: '#1f1b24',
      accentColor: '#e7b64f',
      buttonStyle: 'solid',
      cornerRadius: 10,
      fontPairing: 'geist-lora',
      themeMode: 'auto',
    },
    businessHours: createDefaultBusinessHours(),
    shipping: {
      regions: [
        { id: 'reg_np', name: 'Nepal (Domestic)', flatRate: 120, enabled: true },
        { id: 'reg_sa', name: 'South Asia', flatRate: 850, enabled: true },
        { id: 'reg_intl', name: 'International', flatRate: 2100, enabled: false },
      ],
      freeShippingThreshold: 5000,
      processingTime: '1-2',
      handlingFee: 50,
      defaultCourier: 'pathao',
      notes: 'Orders placed after 5 PM NPT are processed the next business day.',
    },
    payments: createDefaultPayments(),
    notifications: {
      orderNotifications: { email: true, sms: true, push: false },
      lowInventoryAlerts: true,
      newReviewAlerts: true,
      customerMessages: true,
      marketingUpdates: false,
      securityAlerts: true,
    },
    policies: createDefaultPolicies(),
    seo: {
      metaTitle: 'Kathmandu Threads — Contemporary Nepali Streetwear',
      metaDescription:
        'Shop handcrafted streetwear and accessories made in Kathmandu. Small-batch drops, direct-from-artisan pricing, and shipping across Nepal and beyond.',
      keywords: 'nepali streetwear, kathmandu fashion, handmade accessories, nepal ecommerce',
      ogImage: null,
    },
    social: {
      instagram: 'https://instagram.com/kathmanduthreads',
      facebook: 'https://facebook.com/kathmanduthreads',
      tiktok: 'https://tiktok.com/@kathmanduthreads',
      linkedin: '',
      youtube: '',
      pinterest: '',
      twitter: 'https://x.com/ktmthreads',
      website: 'https://kathmanduthreads.com',
    },
    analytics: createDefaultAnalytics(),
    insights: createDefaultInsights(),
    security: createDefaultSecurity(),
  }
}

function createDefaultBusinessHours(): BusinessHours {
  const schedule = {} as BusinessHours['schedule']

  WeekDays.forEach((day: WeekDay) => {
    const isWeekend = day === 'saturday' || day === 'sunday'
    schedule[day] = {
      open: '10:00',
      close: isWeekend ? '17:00' : '19:00',
      closed: day === 'sunday',
    }
  })

  return {
    schedule,
    holidayMode: false,
    vacationMode: false,
    vacationRange: { from: null, to: null },
    temporarilyClosed: false,
  }
}

function createDefaultPayments(): PaymentSettingsState {
  return {
    stripe: {
      key: 'stripe',
      label: 'Stripe',
      description: 'Accept cards, wallets and international payments.',
      connected: true,
      verified: true,
    },
    paypal: {
      key: 'paypal',
      label: 'PayPal',
      description: 'Accept PayPal balance and linked cards.',
      connected: true,
      verified: false,
    },
    bank_transfer: {
      key: 'bank_transfer',
      label: 'Bank Transfer',
      description: 'Manual transfers verified by your team.',
      connected: false,
      verified: false,
    },
    cod: {
      key: 'cod',
      label: 'Cash on Delivery',
      description: 'Collect payment when the order is delivered.',
      connected: true,
      verified: true,
    },
  }
}

function createDefaultPolicies(): StorePolicies {
  return {
    privacyPolicy:
      'We collect only the information required to process your orders and improve your shopping experience. We never sell your personal data to third parties.',
    refundPolicy:
      'Refunds are issued to the original payment method within 5-7 business days of us receiving a returned item in its original condition.',
    returnPolicy:
      'Items can be returned within 14 days of delivery. Products must be unworn, unwashed, and include original tags and packaging.',
    shippingPolicy:
      'Orders are processed within 1-2 business days. Delivery timelines vary by courier and destination and are shown at checkout.',
    termsAndConditions:
      'By placing an order with Kathmandu Threads, you agree to our terms of sale, pricing policy, and acceptable use guidelines.',
  }
}

function createDefaultAnalytics(): AnalyticsMetric[] {
  return [
    {
      key: 'todaySales',
      label: "Today's Sales",
      value: 'रू 48,200',
      delta: 12.4,
      trend: [12, 18, 14, 22, 19, 26, 24],
    },
    {
      key: 'monthlyRevenue',
      label: 'Monthly Revenue',
      value: 'रू 1.2M',
      delta: 8.1,
      trend: [40, 42, 38, 45, 50, 48, 55],
    },
    {
      key: 'visitors',
      label: 'Visitors',
      value: '24,318',
      delta: -3.2,
      trend: [30, 28, 32, 27, 25, 24, 22],
    },
    {
      key: 'conversionRate',
      label: 'Conversion Rate',
      value: '3.42%',
      delta: 0.6,
      trend: [3, 3.1, 3.3, 3.0, 3.4, 3.5, 3.42],
    },
    {
      key: 'products',
      label: 'Products',
      value: '342',
      delta: 2.1,
      trend: [320, 325, 330, 334, 338, 340, 342],
    },
    {
      key: 'orders',
      label: 'Orders',
      value: '1,096',
      delta: 5.7,
      trend: [140, 150, 148, 160, 158, 170, 168],
    },
    {
      key: 'refundRate',
      label: 'Refund Rate',
      value: '1.8%',
      delta: -0.4,
      trend: [2.4, 2.2, 2.1, 2.0, 1.9, 1.85, 1.8],
    },
    {
      key: 'returningCustomers',
      label: 'Returning Customers',
      value: '46%',
      delta: 3.9,
      trend: [38, 39, 41, 42, 44, 45, 46],
    },
  ]
}

function createDefaultInsights(): PerformanceInsight[] {
  return [
    {
      id: 'missing-images',
      issue: 'Products missing images',
      description: '14 products have no primary image, which can hurt conversion.',
      priority: 'high',
      actionLabel: 'Add images',
      count: 14,
    },
    {
      id: 'out-of-stock',
      issue: 'Products out of stock',
      description: '9 products have been out of stock for over 7 days.',
      priority: 'high',
      actionLabel: 'Restock now',
      count: 9,
    },
    {
      id: 'low-conversion',
      issue: 'Low conversion products',
      description: '6 products have high views but under 0.5% conversion.',
      priority: 'medium',
      actionLabel: 'Review pricing',
      count: 6,
    },
    {
      id: 'abandoned-carts',
      issue: 'Abandoned carts',
      description: '38 carts were abandoned in the last 24 hours.',
      priority: 'medium',
      actionLabel: 'Send reminder',
      count: 38,
    },
    {
      id: 'pending-reviews',
      issue: 'Pending reviews',
      description: '21 customer reviews are awaiting your response.',
      priority: 'low',
      actionLabel: 'Respond now',
      count: 21,
    },
    {
      id: 'response-rate',
      issue: 'Customer response rate',
      description: 'Your average reply time is 14 hours, above the 6 hour target.',
      priority: 'medium',
      actionLabel: 'View inbox',
    },
  ]
}

function createDefaultSecurity(): SecuritySettingsState {
  return {
    twoFactorEnabled: true,
    apiKeys: [
      {
        id: 'key_live_1',
        label: 'Live server key',
        maskedKey: 'sk_live_••••••••••••4f2a',
        createdAt: '2024-11-02T00:00:00.000Z',
        lastUsed: '2026-06-30T09:12:00.000Z',
      },
      {
        id: 'key_test_1',
        label: 'Test / sandbox key',
        maskedKey: 'sk_test_••••••••••••91bd',
        createdAt: '2024-11-02T00:00:00.000Z',
        lastUsed: '2026-06-21T14:40:00.000Z',
      },
    ],
    connectedApps: [
      {
        id: 'app_meta',
        name: 'Meta Commerce',
        description: 'Syncs your catalog to Instagram & Facebook Shops.',
        connectedAt: '2025-03-11T00:00:00.000Z',
        icon: 'instagram',
      },
      {
        id: 'app_mailchimp',
        name: 'Mailchimp',
        description: 'Marketing automation and abandoned cart emails.',
        connectedAt: '2025-06-04T00:00:00.000Z',
        icon: 'mail',
      },
    ],
    devices: [
      {
        id: 'dev_1',
        device: 'MacBook Pro',
        browser: 'Chrome on macOS',
        location: 'Kathmandu, NP',
        lastActive: '2026-07-02T08:02:00.000Z',
        current: true,
      },
      {
        id: 'dev_2',
        device: 'iPhone 15',
        browser: 'Safari on iOS',
        location: 'Kathmandu, NP',
        lastActive: '2026-07-01T20:44:00.000Z',
        current: false,
      },
      {
        id: 'dev_3',
        device: 'Windows PC',
        browser: 'Edge on Windows',
        location: 'Pokhara, NP',
        lastActive: '2026-06-27T11:15:00.000Z',
        current: false,
      },
    ],
  }
}
