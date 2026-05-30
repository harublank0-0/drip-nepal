export const GlobalRoles = {
  ADMIN: 'admin',
  VENDOR: 'vendor',
  CUSTOMER: 'customer',
} as const

export type GlobalRole = (typeof GlobalRoles)[keyof typeof GlobalRoles]
