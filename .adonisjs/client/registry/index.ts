/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'shops.register.shop_registrations.create': {
    methods: ["GET","HEAD"],
    pattern: '/shops/register',
    tokens: [{"old":"/shops/register","type":0,"val":"shops","end":""},{"old":"/shops/register","type":0,"val":"register","end":""}],
    types: placeholder as Registry['shops.register.shop_registrations.create']['types'],
  },
  'shops.register.shop_registrations.store': {
    methods: ["POST"],
    pattern: '/shops/register',
    tokens: [{"old":"/shops/register","type":0,"val":"shops","end":""},{"old":"/shops/register","type":0,"val":"register","end":""}],
    types: placeholder as Registry['shops.register.shop_registrations.store']['types'],
  },
  'shop.shop_dashboard.create': {
    methods: ["GET","HEAD"],
    pattern: '/shop/:shopSlug/dashboard',
    tokens: [{"old":"/shop/:shopSlug/dashboard","type":0,"val":"shop","end":""},{"old":"/shop/:shopSlug/dashboard","type":1,"val":"shopSlug","end":""},{"old":"/shop/:shopSlug/dashboard","type":0,"val":"dashboard","end":""}],
    types: placeholder as Registry['shop.shop_dashboard.create']['types'],
  },
  'ui.auth.registration.create': {
    methods: ["GET","HEAD"],
    pattern: '/auth/signup',
    tokens: [{"old":"/auth/signup","type":0,"val":"auth","end":""},{"old":"/auth/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['ui.auth.registration.create']['types'],
  },
  'ui.auth.session.create': {
    methods: ["GET","HEAD"],
    pattern: '/auth/login',
    tokens: [{"old":"/auth/login","type":0,"val":"auth","end":""},{"old":"/auth/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['ui.auth.session.create']['types'],
  },
  'api.auth.registration.store': {
    methods: ["POST"],
    pattern: '/api/v1/signup',
    tokens: [{"old":"/api/v1/signup","type":0,"val":"api","end":""},{"old":"/api/v1/signup","type":0,"val":"v1","end":""},{"old":"/api/v1/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['api.auth.registration.store']['types'],
  },
  'api.auth.session.store': {
    methods: ["POST"],
    pattern: '/api/v1/login',
    tokens: [{"old":"/api/v1/login","type":0,"val":"api","end":""},{"old":"/api/v1/login","type":0,"val":"v1","end":""},{"old":"/api/v1/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['api.auth.session.store']['types'],
  },
  'api.auth.logout': {
    methods: ["POST"],
    pattern: '/api/v1/logout',
    tokens: [{"old":"/api/v1/logout","type":0,"val":"api","end":""},{"old":"/api/v1/logout","type":0,"val":"v1","end":""},{"old":"/api/v1/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['api.auth.logout']['types'],
  },
  'home': {
    methods: ["GET","HEAD"],
    pattern: '/',
    tokens: [{"old":"/","type":0,"val":"/","end":""}],
    types: placeholder as Registry['home']['types'],
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
