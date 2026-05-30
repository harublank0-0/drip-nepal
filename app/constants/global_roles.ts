export const GlobalRoles = [
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Admins of DripNepal.',
  },
  {
    name: 'Shop Owner',
    slug: 'shop-owner',
    description: 'Shop owners of DripNepal.',
  },
] as const

export type GlobalRole = (typeof GlobalRoles)[keyof typeof GlobalRoles]
