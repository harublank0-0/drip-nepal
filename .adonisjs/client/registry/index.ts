/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'shops.shop_registrations.create': {
    methods: ["GET","HEAD"],
    pattern: '/shops/register',
    tokens: [{"old":"/shops/register","type":0,"val":"shops","end":""},{"old":"/shops/register","type":0,"val":"register","end":""}],
    types: placeholder as Registry['shops.shop_registrations.create']['types'],
  },
  'shops.shop_registrations.store': {
    methods: ["POST"],
    pattern: '/shops/register',
    tokens: [{"old":"/shops/register","type":0,"val":"shops","end":""},{"old":"/shops/register","type":0,"val":"register","end":""}],
    types: placeholder as Registry['shops.shop_registrations.store']['types'],
  },
  'shops.dashboard.shop_dashboard.create': {
    methods: ["GET","HEAD"],
    pattern: '/shops/dashboard',
    tokens: [{"old":"/shops/dashboard","type":0,"val":"shops","end":""},{"old":"/shops/dashboard","type":0,"val":"dashboard","end":""}],
    types: placeholder as Registry['shops.dashboard.shop_dashboard.create']['types'],
  },
  'shop_dashboard.create': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop',
    tokens: [{"old":"/vendor/shop","type":0,"val":"vendor","end":""},{"old":"/vendor/shop","type":0,"val":"shop","end":""}],
    types: placeholder as Registry['shop_dashboard.create']['types'],
  },
  'shop_settings.overview': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/overview',
    tokens: [{"old":"/vendor/shop/overview","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/overview","type":0,"val":"shop","end":""},{"old":"/vendor/shop/overview","type":0,"val":"overview","end":""}],
    types: placeholder as Registry['shop_settings.overview']['types'],
  },
  'shop_settings.general': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/general',
    tokens: [{"old":"/vendor/shop/general","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/general","type":0,"val":"shop","end":""},{"old":"/vendor/shop/general","type":0,"val":"general","end":""}],
    types: placeholder as Registry['shop_settings.general']['types'],
  },
  'shop_settings.branding': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/branding',
    tokens: [{"old":"/vendor/shop/branding","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/branding","type":0,"val":"shop","end":""},{"old":"/vendor/shop/branding","type":0,"val":"branding","end":""}],
    types: placeholder as Registry['shop_settings.branding']['types'],
  },
  'shop_settings.business_hours': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/business-hours',
    tokens: [{"old":"/vendor/shop/business-hours","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/business-hours","type":0,"val":"shop","end":""},{"old":"/vendor/shop/business-hours","type":0,"val":"business-hours","end":""}],
    types: placeholder as Registry['shop_settings.business_hours']['types'],
  },
  'shop_settings.shipping': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/shipping',
    tokens: [{"old":"/vendor/shop/shipping","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/shipping","type":0,"val":"shop","end":""},{"old":"/vendor/shop/shipping","type":0,"val":"shipping","end":""}],
    types: placeholder as Registry['shop_settings.shipping']['types'],
  },
  'shop_settings.payments': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/payments',
    tokens: [{"old":"/vendor/shop/payments","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/payments","type":0,"val":"shop","end":""},{"old":"/vendor/shop/payments","type":0,"val":"payments","end":""}],
    types: placeholder as Registry['shop_settings.payments']['types'],
  },
  'shop_settings.notifications': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/notifications',
    tokens: [{"old":"/vendor/shop/notifications","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/notifications","type":0,"val":"shop","end":""},{"old":"/vendor/shop/notifications","type":0,"val":"notifications","end":""}],
    types: placeholder as Registry['shop_settings.notifications']['types'],
  },
  'shop_settings.seo': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/seo',
    tokens: [{"old":"/vendor/shop/seo","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/seo","type":0,"val":"shop","end":""},{"old":"/vendor/shop/seo","type":0,"val":"seo","end":""}],
    types: placeholder as Registry['shop_settings.seo']['types'],
  },
  'shop_settings.policies': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/policies',
    tokens: [{"old":"/vendor/shop/policies","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/policies","type":0,"val":"shop","end":""},{"old":"/vendor/shop/policies","type":0,"val":"policies","end":""}],
    types: placeholder as Registry['shop_settings.policies']['types'],
  },
  'shop_settings.social': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/social',
    tokens: [{"old":"/vendor/shop/social","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/social","type":0,"val":"shop","end":""},{"old":"/vendor/shop/social","type":0,"val":"social","end":""}],
    types: placeholder as Registry['shop_settings.social']['types'],
  },
  'shop_settings.analytics': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/analytics',
    tokens: [{"old":"/vendor/shop/analytics","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/analytics","type":0,"val":"shop","end":""},{"old":"/vendor/shop/analytics","type":0,"val":"analytics","end":""}],
    types: placeholder as Registry['shop_settings.analytics']['types'],
  },
  'shop_settings.security': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/security',
    tokens: [{"old":"/vendor/shop/security","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/security","type":0,"val":"shop","end":""},{"old":"/vendor/shop/security","type":0,"val":"security","end":""}],
    types: placeholder as Registry['shop_settings.security']['types'],
  },
  'shop_settings.danger': {
    methods: ["GET","HEAD"],
    pattern: '/vendor/shop/danger',
    tokens: [{"old":"/vendor/shop/danger","type":0,"val":"vendor","end":""},{"old":"/vendor/shop/danger","type":0,"val":"shop","end":""},{"old":"/vendor/shop/danger","type":0,"val":"danger","end":""}],
    types: placeholder as Registry['shop_settings.danger']['types'],
  },
  'home': {
    methods: ["GET","HEAD"],
    pattern: '/',
    tokens: [{"old":"/","type":0,"val":"/","end":""}],
    types: placeholder as Registry['home']['types'],
  },
  'new_account.create': {
    methods: ["GET","HEAD"],
    pattern: '/signup',
    tokens: [{"old":"/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['new_account.create']['types'],
  },
  'new_account.store': {
    methods: ["POST"],
    pattern: '/signup',
    tokens: [{"old":"/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['new_account.store']['types'],
  },
  'session.create': {
    methods: ["GET","HEAD"],
    pattern: '/login',
    tokens: [{"old":"/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['session.create']['types'],
  },
  'session.store': {
    methods: ["POST"],
    pattern: '/login',
    tokens: [{"old":"/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['session.store']['types'],
  },
  'men': {
    methods: ["GET","HEAD"],
    pattern: '/men',
    tokens: [{"old":"/men","type":0,"val":"men","end":""}],
    types: placeholder as Registry['men']['types'],
  },
  'women': {
    methods: ["GET","HEAD"],
    pattern: '/women',
    tokens: [{"old":"/women","type":0,"val":"women","end":""}],
    types: placeholder as Registry['women']['types'],
  },
  'categories.show': {
    methods: ["GET","HEAD"],
    pattern: '/categories/:slug',
    tokens: [{"old":"/categories/:slug","type":0,"val":"categories","end":""},{"old":"/categories/:slug","type":1,"val":"slug","end":""}],
    types: placeholder as Registry['categories.show']['types'],
  },
  'men_product_detail': {
    methods: ["GET","HEAD"],
    pattern: '/:attributeValue/:productSlug',
    tokens: [{"old":"/:attributeValue/:productSlug","type":1,"val":"attributeValue","end":""},{"old":"/:attributeValue/:productSlug","type":1,"val":"productSlug","end":""}],
    types: placeholder as Registry['men_product_detail']['types'],
  },
  'cart': {
    methods: ["GET","HEAD"],
    pattern: '/cart',
    tokens: [{"old":"/cart","type":0,"val":"cart","end":""}],
    types: placeholder as Registry['cart']['types'],
  },
  'checkout': {
    methods: ["GET","HEAD"],
    pattern: '/checkout',
    tokens: [{"old":"/checkout","type":0,"val":"checkout","end":""}],
    types: placeholder as Registry['checkout']['types'],
  },
  'design-system': {
    methods: ["GET","HEAD"],
    pattern: '/design-system',
    tokens: [{"old":"/design-system","type":0,"val":"design-system","end":""}],
    types: placeholder as Registry['design-system']['types'],
  },
  'session.destroy': {
    methods: ["POST"],
    pattern: '/logout',
    tokens: [{"old":"/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['session.destroy']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
