export const ProductPermissions = [
  {
    name: 'View Products',
    slug: 'products.view',
    description: 'Allows viewing products',
  },

  {
    name: 'Create Products',
    slug: 'products.create',
    description: 'Allows creating new products',
  },

  {
    name: 'Update Products',
    slug: 'products.update',
    description: 'Allows updating existing products',
  },

  {
    name: 'Delete Products',
    slug: 'products.delete',
    description: 'Allows deleting products',
  },

  {
    name: 'Publish Products',
    slug: 'products.publish',
    description: 'Allows publishing products',
  },
] as const

export type PermissionSlug = (typeof ProductPermissions)[number]
