# DripNepal

Our system currently has 4 major domains:

1. Identity and Authorization
2. Vendor / Shop System
3. Product Catalog
4. Commerce System

## 1. Identity and Authorization

This controls:

- who users are
- what they can do
- which shops they belong to

### users

Core identity table.

Represents:

**person/account**
Example:

- customer
- vendor owner
- shop staff
- admin

**Why it exists**
Authentication foundation

Handles:

- login
- identity
- verification
- profile info

**Important Principle**
A user is not a shop.

Users can:

- Own shops
- work in shops
- buy products

### roles

Global platform roles.

- admin
- customer
- vendor

**Why it exists**
Defines:

_broad platform-level access_
Example:

- admins access moderation
- customer place orders

### permissions

Defines individual actions.
Examples:

- `product.create`
- `orders.manage`
- `vendors.approve`

**Why it exists**
Granular authorization
Instead of:
`is_admin = true`

we now have scalable permissions.

### role_permissions

Connects:
`roles` <-> `permissions`

Example:
admin
└── users.suspend

### user_roles

Connects:
`users` <-> `roles`
Allows:

- one user to have multiple roles

Example:
`customer` + `vendor`
simultaneously.

## 2. Vendor / Shop System

This powers:
**the marketplace structure**

### shops

Represents:

**the business/storefront/vendor**
Examples:

- Urban Drip
- Kathmandu Kicks
- NepThreads

_Why it exists_
Products belong to shops.
Not directly to users.

This gives:

- vendor isolation
- analytics separation
- permissions separation
- scalability

**Important Principle**
Shop = **business entity/storefront**
User = **human identity**

### shop_roles

Roles inside a specific shop.

- manager
- inventory_staff
- suppport_staff

**Why it exists**
Vendors may have teams.
This allows:

- multi-staff shops
- scalable permissions
- operational delegation

### shop_role_permissions

Connects:
`shop_role` <-> `permissions`

Example:
inventory_staff
└── products.update

### shop_staff_roles

Connects:
`users` ↔ `shops` ↔ `shop_roles`

**Why it exists**
Allows:

- one user in multiple shops
- different permissions per shop

## 3. Product Catalog Domain

This powers:
**the storefront** and **product discovery**

### categories

Hierarchical product organization.

Examples:
"```
Men
└── Hoodies

Women
└── Dresses```

**Why it exists**
Enables:

- navigation
- filtering
- organization
- SEO structure

_parent_id_ creates **nested categories**, without hardcoding category levels.

### products

Represents:

**the conceptual product**
Example:
`Oversized Black Hoodie`

**Why it exists**
Contains:

- title
- description
- branding
- SEO
- shared images
- instagram / tiktok embedded videos

But not:

- stock
- purchasable combinations
  they will be available in product variants

products are **marketing entities**.
variants are **purchasable entities**.

### product_variants

Most important ecommerce table.
Represents **actual purchasable items**

```drip
Black / M
Black / L
White / S
```

**Why it exists**
Inventory lives here.
Each variants has:

- sku
- stock
- price
- purchasable identity

### attributes

Defines:

**attribute types**
Different product have different attributes

- size
- color
- material

**why it exists**
Makes catalog flexible.
Allow future expansion into:

- shoes
- watches
- bags
- sarees etc

### attribute_values

Possible values:

- S
- M
- L
- Black
- Neon

### variant_attribute_values

Connects:
`variant` <-> `attribute_value`

````drip
Example:
Variant:
Black Hoodie / M

Connected values:
Black
M
4. Commerce Systemo```

**Why it exists**
This is what makes ***flexible variant combinations*** possible

### product_images

Stores product media.

**Why separate Table**
Because products may have:
- multiple images
- variant-specific images
- galleries

we have made **variant_id** nullable to allow

- shared product images
- variant-specific images

Example:
`black hoddie images` belonging only to `black variants`

## Commerce Domain

This powers actual buying.

### addresses

Stores customer shipping info.

**why separate table?**
uses may have

- home
- office
- multiple delivery locations

### carts

Temporary shopping container.

**why it exists**
allows:

- adding items before checkout
- guests carts
- persistent shopping

`session_id` + `user_id` supports

- guest shopping
- login cart merging

very scalable

### cart_items

Items inside cart.
It references `product_variants` not products.
Because size matters, color matters and other variants matters.
Customer buy product's variants.

### orders

Most important business table.
It represents *** completed checkout/business transactions***

**why it exists**
this becomes:

- accounting history
- fulfillment source
- customer history
- analytics source

**order_number** is a human friendly -identifier.
Better than UUIDs for support

### order_items

stores purchased products.
It contains snapshots of product variant at the time of purchase.

**Why snapshots matter**
Products may later:

- change name
- change prices
- get deleted

Orders must preserve historical truth

### payments

Tracks payment attempts/results.

**why separate table?**
Because payments are:

- transactional
- auditable
- retryable
- provider-specific

````
