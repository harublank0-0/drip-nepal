export const GlobalRoles = {
  ADMIN: {
    name: 'Admin',
    slug: 'admin',
    description: 'Admins of DripNepal.',
  },
  SHOP_OWNER: {
    name: 'Shop Owner',
    slug: 'shop-owner',
    description: 'Shop owners of DripNepal.',
  },
}

export const GlobalRolesValues = Object.values(GlobalRoles)
export type GlobalRoleSlug = (typeof GlobalRoles)[keyof typeof GlobalRoles]['slug']
