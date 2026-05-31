export const ProductPermissions = {
  PRODUCTS_VIEW: {
    name: 'View Products',
    slug: 'products.view',
    description: 'Allows viewing products',
  },

  PRODUCTS_CREATE: {
    name: 'Create Products',
    slug: 'products.create',
    description: 'Allows creating new products',
  },

  PRODUCTS_UPDATE: {
    name: 'Update Products',
    slug: 'products.update',
    description: 'Allows updating existing products',
  },

  PRODUCTS_DELETE: {
    name: 'Delete Products',
    slug: 'products.delete',
    description: 'Allows deleting products',
  },

  PRODUCTS_PUBLISH: {
    name: 'Publish Products',
    slug: 'products.publish',
    description: 'Allows publishing products',
  },
} as const

export const ProductPermissionValues = Object.values(ProductPermissions)
export type PermissionSlug = (typeof ProductPermissions)[keyof typeof ProductPermissions]['slug']
