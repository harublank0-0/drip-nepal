# Research: Shadcn UI Kit

Part of the [research digests](README.md) (digest name `shadcnuikit`). Compiled on 2026-09-25; repository paths refer to the code at commit `0282605`. This is a dated snapshot: re-check a fact against its source before relying on it.

Original title: Research: Shadcn UI Kit (shadcnuikit.com), accessed 2026-09-25

- [verified-official] (identity) Shadcn UI Kit (shadcnuikit.com) is published by Bundui. The footer reads "© 2026 Bundui" and the founder/contact is Toby Belhome (@TobyBelhome, github.com/bundui). The site states: "An independent product built on top of shadcn/ui. Not affiliated with the official shadcn/ui project." Its llms.txt adds that it "is not the official shadcn/ui library, nor affiliated with shadcn" and is "a separate, paid product sold with a one-time lifetime license."
  - Sources: https://shadcnuikit.com/; https://shadcnuikit.com/llms.txt; https://github.com/bundui/shadcn-admin-dashboard-free
  - Implication: This is a third-party commercial kit, not part of shadcn/ui. Its license and support come from Bundui, not from the shadcn project.
- [verified-official] (pricing) There are four one-time-payment tiers. Starter is $0 ("Open Source & free"): 1 free template, 9 free blocks, 14 free examples, limited components, unlimited users and projects, no GitHub repo access, no admin dashboards or web apps. Pro is $79 (list $129): 1 user. Team is $199 (list $399): 10 users. Enterprise is $499 (list $699): unlimited users. All paid tiers include 3 premium templates, 314 premium blocks, 56 premium examples, 16 admin dashboards, 17 web apps, Page Builder export, Shadcn CLI, Shadcn MCP, GitHub repo access, unlimited projects and future updates. The current prices come from a "Summer Sale: 40% off" banner. Paddle processes payments. Refunds are generally not offered.
  - Sources: https://shadcnuikit.com/pricing
  - Implication: The license is priced per user or seat. Count the developers who will pull premium code (Pro allows only 1) before buying.
- [verified-official] (license) Pricing FAQ, quoted exactly: "You cannot use the premium components or templates in an open-source project where the source code is publicly available, as this would redistribute our paid content for free. You may only use them in closed-source projects." The DripNepal repo (harublank0-0/drip-nepal) is PUBLIC on GitHub (gh repo view: visibility PUBLIC) and carries an MIT LICENSE ("Copyright (c) 2026 Haru Blank").
  - Sources: https://shadcnuikit.com/pricing; https://github.com/harublank0-0/drip-nepal
  - Implication: This is a blocker. Committing any Pro block or template code to the current public, MIT-licensed repo would breach the vendor's stated terms. Before adopting paid items, do one of these: make the repo private, keep premium code out of the public repo, or get written permission from Bundui. Free items do not carry this FAQ restriction.
- [verified-official] (license) Commercial and SaaS use is allowed. Quote: "Your license allows you to build an unlimited number of projects, from simple public websites to paid SaaS applications ... However, you may not use Shadcn UI Kit to create website builders, template marketplaces, or tools that allow others to build sites using Shadcn UI Kit components directly." Client work is allowed "for a single client", with no reselling to multiple clients "without making substantial modifications." No attribution is required. You can upgrade by paying the difference.
  - Sources: https://shadcnuikit.com/pricing
  - Implication: A multi-vendor marketplace is a normal end product and is allowed. Do not expose kit blocks as a storefront or page builder for vendors, because the ban on website builders and builder tools could apply.
- [partially-verified] (license) No standalone license agreement was found. /license returns HTTP 404. /terms-conditions only says the site's content and software "are the property of Bundui ... Unauthorized use of these materials is prohibited". It does not define seats, projects or redistribution. The only license terms are in the pricing FAQ and a statement on the components page.
  - Sources: https://shadcnuikit.com/license; https://shadcnuikit.com/terms-conditions
  - Implication: The license terms are FAQ-level only. Get written clarification from contact@shadcnuikit.com on the public-repo question and on what counts as a "user" before committing.
- [partially-verified] (license) The components page says 527 of 532 component variants are free, and that "Free and premium components can be used in commercial products and client work without attribution." The free admin dashboard repo (bundui/shadcn-admin-dashboard-free) has no LICENSE file: the GitHub API license field is null and the README has no license text.
  - Sources: https://shadcnuikit.com/components; https://github.com/bundui/shadcn-admin-dashboard-free
  - Implication: Free items look usable in a commercial app, but no OSS license covers redistributing them. Treat committing free items to the public MIT repo as low risk but not formally licensed.
- [verified-official] (blocks-ecommerce) The Ecommerce block section has 11 categories and 59 blocks, and every one is labeled "Pro": Checkout Page (5), Product List (8), Product Category (9), Product Cards (11), Product Details (7), Product Features (2), Shopping Cart (4), Promo Sections (1), Store Navigation (1), Customer Reviews (9), Product Quickviews (2). The changelog for Jul 22, 2026 added 18 of these (Checkout, Shopping Cart, Customer Reviews). There is no storefront category for order history, customer account, wishlist or a standalone filter sidebar. Filtering is mentioned only inside the Product List and Store Navigation descriptions.
  - Sources: https://shadcnuikit.com/blocks; https://shadcnuikit.com/blocks/ecommerce/checkout-page; https://shadcnuikit.com/r/registry.json
  - Implication: None of the storefront blocks are free, so using any of them needs a paid plan and triggers the public-repo restriction. DripNepal already has custom cart and checkout flows (inertia/components/commerce/cart and checkout), so the new blocks add little there. Order history, account pages and wishlist would still be custom work.
- [verified-official] (blocks-dashboard) The E-commerce admin dashboard demo sidebar lists these subpages: Dashboard, Product List, Product Detail, Add Product, Order List, Order Detail. Other pages in the kit: Users List, Profile V1, Profile V2, Onboarding Flow, Empty States, Settings, Pricing, Authentication, Notifications Page, Error Pages, Widgets, and a POS App. The E-commerce dashboard page shows revenue, sales by location, store visits by source, customer reviews, Recent Orders table and Best Selling Products. These are part of the premium dashboard template ("Download the full source code"). The free version has 1 dashboard and 5+ pages.
  - Sources: https://shadcnuikit.com/dashboard/ecommerce; https://shadcnuikit.com/admin-dashboard; https://github.com/bundui/shadcn-admin-dashboard-free
  - Implication: The template maps well to the vendor dashboard at /shops/:shopSlug/dashboard (products, orders) and to platform admin (users, settings). It ships as a Next.js app, so pages must be ported rather than installed.
- [verified-official] (blocks-dashboard) There are 10 Dashboard UI block categories: Form Layouts (2), Charts (20), Signin Forms (3), Stat Cards (8), Modal Dialogs (28), Page Layouts (3), Sidebar Layouts (1), Dashboard Shell (9), Onboarding Screens (10), Tables (18). Only four are labeled Free: Sign In Form 1, Stat Card 1, Table 1 and Modal Dialog 16. Everything else is Pro.
  - Sources: https://shadcnuikit.com/blocks/dashboard-ui/tables; https://shadcnuikit.com/blocks/dashboard-ui/stat-cards; https://shadcnuikit.com/blocks/dashboard-ui/sign-in-forms; https://shadcnuikit.com/blocks/dashboard-ui/modal-dialogs
  - Implication: On the free tier, only a stat card, a basic table, a sign-in form and one modal help the dashboards. Dashboard Shell, Charts and most Tables need a paid plan.
- [verified-official] (delivery) The official shadcn registry directory lists @shadcnuikit at url https://shadcnuikit.com/r/{name}.json. Free items such as stat-card1, table and signin-form1 return HTTP 200 without auth. Premium items return 404 plus an auth message. A shadcn 4.11.1 CLI dry-run of @shadcnuikit/checkout1 printed: "Authentication is required for the pro components ... Generate an API key at https://shadcnuikit.com/dashboard/licences" and asked for components.json registries {"@shadcnuikit": {"url": "https://shadcnuikit.com/r/{name}", "headers": {"Authorization": "Bearer ${YOUR_API_KEY}"}}}. The Feb 27, 2026 changelog added a premium user dashboard to "Manage your license keys", "Connect your GitHub access" and manage teams. Paid plans also include GitHub repo access and a full-source download of the dashboard template.
  - Sources: https://ui.shadcn.com/r/registries.json; https://shadcnuikit.com/r/registry.json; https://shadcnuikit.com/changelog
  - Implication: Delivery works with the repo's existing shadcn CLI 4.11 setup. Keep the Bearer token in an env var and never commit it. Blocks come through the CLI; the full admin template comes as a repo or zip download.
- [verified-official] (delivery) The directory lists @shadcnuikit as status "degraded" (score 78.5, "Sampled registry items are failing validation"), while @commercn is "healthy" (98.1). Every item sampled (60 components plus 3 free blocks) had no `dependencies` or `registryDependencies` fields, even when importing sonner, @tanstack/react-table, @dnd-kit/_, emblor, @remixicon/react or ~/components/ui/_. Each file has a hard-coded target of "components/<name>.tsx". In a scratch copy of this repo's components.json, `shadcn add @shadcnuikit/signin-form1 --dry-run` planned to create repo-root `components/signin-form1.tsx`, not `inertia/components/`, and `-p inertia/components/blocks` did not change that. Imports were rewritten correctly to `~/components/ui/*`.
  - Sources: https://ui.shadcn.com/r/registries.json; https://shadcnuikit.com/r/signin-form1.json
  - Implication: After each `shadcn add`, move the file from ./components/ into inertia/components/…. Separately run `shadcn add <base components>` and `pnpm add <npm deps>`, because the CLI will not install them. Watch for name clashes: the free block `table` targets components/table.tsx.
- [verified-official] (framework) The admin dashboard template is "Powered by the Next.js App Router" (Next.js 16, React 19, Tailwind CSS 4, TypeScript). Its listed stack: Dnd Kit, TanStack Table, Tiptap, cmdk, date-fns, Lucide, Motion, Next Themes, Nextjs Toploader, React DayPicker, React Hook Form, Resizable Panels, Recharts, Sonner, Zod, Zustand. Inspected free-version source: next 16.1.0, react 19.2.3, tailwindcss ^4.1.18, radix-ui (unified package), next-themes. Its components.json has style "new-york" and rsc true. next/link appears in 10 files, next/navigation in 3, and next/font once. Pages are async server components that read JSON via fs and use generateMetadata, and a Next 16 proxy.ts does routing.
  - Sources: https://shadcnuikit.com/admin-dashboard; https://github.com/bundui/shadcn-admin-dashboard-free
  - Implication: The dashboard templates are tightly coupled to Next.js. Server-component data loading, metadata, routing hooks, next-themes and toploader must all be replaced with Adonis controllers, Inertia props, Head and the router. No Vite or Inertia edition was found.
- [partially-verified] (framework) The site claims: "All templates and components are fully compatible with React. Seamlessly integrate them into any React-based framework, including Vite, Next.js, Remix, or TanStack Start." It also claims support for Radix UI and Base UI, and Tailwind v4. The Page Builder guide says "The blocks are built on Radix UI, so your project should use a Radix based shadcn/ui style." Free code sampled: 1 of 60 random components (carousel11) imports next/image. The free block signin-form1 imports next/link. The free blocks table and stat-card1 have no Next imports. "use client" is kept after CLI transform (harmless under Vite).
  - Sources: https://shadcnuikit.com/; https://shadcnuikit.com/components; https://shadcnuikit.com/blog/build-a-website-with-shadcn-ui-blocks; https://shadcnuikit.com/r/signin-form1.json
  - Implication: Blocks and components are mostly plain React and fit the radix-nova, Radix-based setup. Expect occasional next/link or next/image imports to swap out. Pro ecommerce block code could not be inspected.
- [verified-official] (framework) Changelog, Aug 23, 2026, "Dashboard Template v2": "The shadcn Nova style has been applied to all dashboard pages" and "All dependencies have been updated to their latest versions."
  - Sources: https://shadcnuikit.com/changelog
  - Implication: The visual language matches the repo's radix-nova style, so the ported dashboard should look consistent with existing ui/ components.
- [verified-official] (components) Block form logic uses various libraries. Form Layouts and Signin Forms advertise "integrated Zod validation". Modal Dialogs (Jul 27, 2026) "ship with built-in validation powered by Formisch and Valibot". Tables use TanStack Table and Charts use Recharts. The admin template uses React Hook Form, Zod and Zustand.
  - Sources: https://shadcnuikit.com/blocks/dashboard-ui/form-layouts; https://shadcnuikit.com/changelog; https://shadcnuikit.com/admin-dashboard
  - Implication: DripNepal uses TanStack Form, so the form wiring in blocks must be rewritten (keep the markup). Otherwise the project takes on RHF, Formisch and Valibot, which it does not use.
- [verified-official] (accessibility) The site makes only general accessibility claims: "Responsive, accessible and dark mode ready" (blocks), "Accessible shadcn/ui components with dark mode support" (admin), "accessible markup" (modal dialogs), and "keyboard support" (File Upload). No WCAG conformance statement or audit was found.
  - Sources: https://shadcnuikit.com/blocks; https://shadcnuikit.com/admin-dashboard; https://shadcnuikit.com/changelog
  - Implication: Accessibility comes from the underlying Radix primitives. Custom markup in blocks (color swatches, quantity steppers, image galleries) still needs its own a11y review.
- [verified-official] (maintenance) Recent changelog entries: Sep 24, 2026 Page Builder; Sep 14 Onboarding Screens and File Upload; Sep 1 AI Analytics Dashboard; Aug 23 Dashboard Template v2; Jul 27 Modal Dialogs; Jul 22 ecommerce blocks; Jun 8 65 marketing blocks. The admin-dashboard page shows "Last update: Sep 24, 2026". The free GitHub repo was last pushed 2025-12-19.
  - Sources: https://shadcnuikit.com/changelog; https://shadcnuikit.com/admin-dashboard; https://github.com/bundui/shadcn-admin-dashboard-free
  - Implication: The paid product is actively maintained on a roughly monthly cadence. The free repo lags behind, so do not treat it as representative of current Pro code.
- [verified-official] (other) In the repo, commercn is referenced in exactly one place: `components.json` line 25, `"@commercn": "https://commercn.com/r/{name}.json"`, added in commit e28eb60. `git grep -i commercn` and `grep -rni commercn inertia` find no other references or imports. commercn's registry has 17 items: cart-01, cart-02, checkout-01, checkout-02, checkout-03, category-01 to category-04, order-01, product-card-01 to product-card-03, product-detail-01, review-01 to review-03. None of those names match local files such as cart_page.tsx or checkout_page.tsx.
  - Sources: `components.json`; https://www.commercn.com/r/registry.json
  - Implication: Dropping commercn only means removing or replacing the registries entry. No code imports break. commercn's order-01 (an orders block) has no equivalent among Shadcn UI Kit's storefront blocks.
- [unverified] (other) The same publisher runs bundui.io, listed in the official shadcn directory as @bundui ("150+ handcrafted UI components ... covering marketing, e-commerce, dashboards"). Per a WebFetch summary, it has e-commerce categories including Order Summaries, Category Filters and Checkout Forms. Its license and pricing were not established. The related github.com/bundui/components repo is MIT.
  - Sources: https://bundui.io; https://ui.shadcn.com/r/registries.json
  - Implication: This may be a free or cheaper source of ecommerce blocks from the same author that avoids the public-repo restriction. Verify its license before relying on it.

## ecommerce_blocks

- Checkout Page: Checkout Page 1, Checkout Page 2, Checkout Page 3, Checkout Page 4, Checkout Page 5 (all Pro; registry checkout1-checkout5)
- Product List: Product List 1-8 (all Pro; registry product-list1-8)
- Product Category: Product Category 1-9 (all Pro; registry product-category1-9)
- Product Cards: Product Cards 1-11 (all Pro; registry product-cards1-11)
- Product Details: Product Detail 1-7 (all Pro; registry product-details1-7)
- Product Features: Product Feature 1-2 (all Pro)
- Shopping Cart: Shopping Cart 1-4 (all Pro; registry shopping-cart1-4)
- Promo Sections: Promo Section 1 (Pro; registry promo-section)
- Store Navigation: Store Navigation 1 (Pro; registry store-navigation)
- Customer Reviews: Customer Reviews 1-9 (all Pro; registry customer-reviews1-9)
- Product Quickviews: Product Quickview 1-2 (all Pro; registry product-quickview1-2)
- Examples (not blocks): Product Cards, Product List, Review Cards, Payment Methods, Ecommerce Charts

## dashboard_blocks

- E-commerce Dashboard (premium template) with subpages: Dashboard, Product List, Product Detail, Add Product, Order List, Order Detail
- Other admin dashboards: Classic Dashboard, Sales Dashboard, CRM Dashboard, Project Management Dashboard, File Manager Dashboard, Crypto Dashboard, Academy/School Dashboard, Hospital Management Dashboard, Analytics Dashboard, Finance Dashboard, Payment Dashboard, HR Dashboard, Real Estate Dashboard, Hotel Management Dashboard, AI Analytics Dashboard (Logistics and Affiliate marked Coming Soon)
- Template pages: Users List, Profile V1, Profile V2, Onboarding Flow, Empty States, Settings, Pricing, Authentication, Notifications Page, Error Pages, Widgets
- Web apps: POS App, Kanban, Notes, Chats, Social Media, Workflow Automation, Mail, Todo List App, Tasks, Calendar, File Manager, Api Keys, Courses, AI Chat, AI Chat V2, Image Generator, Text to Speech
- Dashboard UI blocks > Dashboard Shell: Dashboard Shell 1-9 (Pro)
- Dashboard UI blocks > Tables: Table 1 (Free), Table 2-18 (Pro)
- Dashboard UI blocks > Stat Cards: Stat Card 1 (Free), Stat Card 2-8 (Pro)
- Dashboard UI blocks > Charts: Chart 1-20 (Pro)
- Dashboard UI blocks > Form Layouts: Form Layout 1-2 (Pro)
- Dashboard UI blocks > Page Layouts: Page Layout 1-3 (Pro)
- Dashboard UI blocks > Sidebar Layouts: Sidebar Layout 1 (Pro)
- Dashboard UI blocks > Modal Dialogs: Modal Dialog 1-28 (Modal Dialog 16 Free, rest Pro)
- Dashboard UI blocks > Signin Forms: Sign In Form 1 (Free), Sign In Form 2-3 (Pro)
- Dashboard UI blocks > Onboarding Screens: Onboarding Screen 1-10 (Pro)
- Examples: Stat Cards, Ecommerce Charts, Line Charts, Project Management Charts, User Menus

## porting_notes_for_inertia_vite

- Licensing first: the repo is PUBLIC with an MIT LICENSE. Do not commit Pro blocks or templates until the repo is private or Bundui confirms in writing that an alternative arrangement is acceptable. Free items are not covered by that FAQ restriction.
- components.json: replace the `@commercn` entry (line 25) with `"@shadcnuikit": { "url": "https://shadcnuikit.com/r/{name}", "headers": { "Authorization": "Bearer ${SHADCNUIKIT_API_KEY}" } }`, the format the CLI suggested. Put the key in .env (gitignored), never in components.json. Free-only use works with the plain string form `https://shadcnuikit.com/r/{name}.json`.
- CLI placement: registry files carry a hard-coded target `components/<name>.tsx`. In this repo a dry run placed them at repo-root ./components/, outside inertia/, and `-p` did not redirect them. After every `shadcn add @shadcnuikit/...`, move the file into inertia/components/blocks/ (or similar) and rename it to the project's snake_case convention. Watch for the free `table` block colliding by name with ui/table.
- Dependencies are not declared by the registry items. Manually run `pnpm dlx shadcn add` for the base components they import. This repo's ui/ has no table, sidebar, chart, radio-group, breadcrumb, dropdown usage patterns, etc. yet. Then `pnpm add` the npm packages the blocks import (e.g. @tanstack/react-table, recharts, @dnd-kit/\*, sonner, zod, react-hook-form or valibot/formisch as applicable).
- next/link: swap for Inertia `Link`. The repo's commerce components already import from '@adonisjs/inertia/react'; @inertiajs/react's Link is also available. Replace `href` strings with Adonis route helpers or tuyau URLs.
- next/image: swap for a plain <img> with explicit width/height, loading="lazy" and decoding="async", or a small project Image wrapper. Replace remote demo image URLs (blocks load images from vendor-hosted URLs) with your own assets or CDN.
- next/navigation (usePathname, useRouter): use `usePage().url` and `router.visit()` from @inertiajs/react.
- Server components and data loading (async page components reading fs, generateMetadata): move data fetching into Adonis controllers passed as Inertia props, and replace metadata with Inertia `<Head>`. Replace proxy.ts redirects with Adonis routes or middleware.
- next-themes and nextjs-toploader: use a small ThemeProvider (class on <html>, SSR-safe) or keep next-themes only after verifying it works under Inertia SSR. Inertia has a built-in progress bar that replaces the toploader.
- next/font/google: load fonts via CSS @import/Google Fonts link in the Edge root template, or via @fontsource packages.
- Inertia SSR is enabled, so check blocks using browser-only APIs (Recharts ResponsiveContainer, dnd-kit, window/localStorage in effects) render safely on the server. Wrap them in client-only guards if needed.
- Forms: blocks use Zod plus React Hook Form, or Formisch plus Valibot (modal dialogs). DripNepal uses TanStack Form with backend validators, so keep the block markup and rewire state and validation to TanStack Form to avoid a second form stack.
- Styling: both are Tailwind v4, and Dashboard Template v2 uses the shadcn Nova style, matching radix-nova. Merge any theme CSS variables from the kit into inertia/css/app.css carefully rather than overwriting the zinc base tokens.
- 'use client' directives survive the CLI transform. They are harmless in Vite and can be stripped for tidiness.
- Existing custom cart and checkout code in inertia/components/commerce has no dependency on commercn, so removing the registry entry breaks nothing. Decide per page whether a Pro block beats the existing multi-store cart grouping (cart_store_group.tsx), which the generic blocks are unlikely to model.

## could_not_verify

- Source of Pro ecommerce blocks (checkout, cart, product details, etc.): gated, so it is unknown whether they import next/link, next/image or use server actions.
- Whether a Vite, React Router or Inertia edition of the premium admin dashboard template exists. None was found; only Next.js is referenced.
- Full license agreement text: /license returns 404 and Terms & Conditions has no license grant. The definition of "user" or seat and whether a private submodule or package would satisfy the "closed-source" rule are unverified.
- Whether free items may be committed to a public MIT-licensed repo. The FAQ restricts only premium items, and the free dashboard repo has no LICENSE.
- Whether blocks are published in separate Base UI variants. The registry has one item per name; the site claims Radix and Base UI compatibility, while the Page Builder says blocks are Radix-based.
- Any formal accessibility testing or WCAG conformance.
- How GitHub repo access works for paid plans (for example, an invite to a private repo) and exactly which repos it covers.
- Whether any code in inertia/components/commerce was originally copied from commercn blocks. File names do not match commercn registry names, but that does not prove independence.
- Why the official shadcn directory marks @shadcnuikit "degraded" (item validation failures). It may relate to the missing dependencies and registryDependencies.
- The ecommerce block category list on bundui.io is from a WebFetch summary, not checked directly. bundui.io's pricing, license and exact ecommerce block contents were also not verified.
- Figma file (listed as Coming soon).

## free_vs_paid

Free (Starter, $0): 527 of 532 component variants, 9 free blocks, 14 free examples and 1 free template. The component-variant count comes from the components page; the other counts come from pricing. None of the free blocks are ecommerce blocks. All 59 ecommerce blocks are Pro. The only free Dashboard UI blocks are Sign In Form 1, Stat Card 1, Table 1 and Modal Dialog 16. The free admin dashboard is a separate GitHub repo (bundui/shadcn-admin-dashboard-free: 1 dashboard, 5+ pages, no LICENSE file). Free items install from the @shadcnuikit registry without auth.

Paid tiers are one-time payments with lifetime updates: Pro $79 (1 user), Team $199 (10 users), Enterprise $499 (unlimited users). These are sale prices; list prices are $129, $399 and $699. All paid tiers have unlimited projects. They unlock all 314 premium blocks, 16 admin dashboards, 17 web apps, 3 premium templates, Page Builder export, GitHub repo access, and CLI or MCP access via an API key from /dashboard/licences sent as a Bearer header.

Key restriction: premium code may only be used in closed-source projects. It cannot go in a public repo. drip-nepal is currently public and MIT-licensed.

## nextjs_coupling

The admin dashboard templates are Next.js App Router apps (Next.js 16), per the vendor and the free-version source. That source shows next/link in 10 files, next/navigation (usePathname, useRouter) in 3, next/font/google, next-themes, and async server components loading data with fs and generateMetadata. It also uses proxy.ts (Next 16 middleware) and components.json with rsc:true, and the vendor lists nextjs-toploader in the stack. No server actions or next/headers were found in the free source; the premium template source was not inspected.

The blocks and components registry is mostly framework-agnostic React plus shadcn/ui, and the vendor claims Vite, Remix and TanStack Start compatibility. There are some Next imports in free code: signin-form1 uses next/link and carousel11 uses next/image, while table and stat-card1 are plain React. Imports are rewritten to the repo's `~/components/ui/*` alias by the CLI. Blocks are built for Radix-based shadcn styles, which matches this repo's radix-nova style.

Pro ecommerce block source is behind the paywall, so whether it uses next/link, next/image or server actions is unknown.

## Fact-check

## Missed facts found by fact-checker

- The pricing FAQ's "please review the license details" link goes to /terms-conditions, which has no license terms. No real license agreement exists anywhere on the site; it lives only in FAQ prose. Sources: https://shadcnuikit.com/pricing and https://shadcnuikit.com/terms-conditions
- Free items come with no open-source license either. They are described only as "free to copy and use in personal and commercial projects", and the free GitHub repo has no LICENSE file, even though the Starter tier is labeled "Open Source & free". Putting even free shadcnuikit code into DripNepal's public MIT repo is legally unclear, and premium code is explicitly barred: "Premium components cannot be redistributed in open source projects". Sources: https://shadcnuikit.com/components and https://github.com/bundui/shadcn-admin-dashboard-free
- The registry serves three blocks the site labels Pro without authentication: promo-section and store-navigation (ecommerce) and sidebar-layout. The 12 publicly available block items minus these 3 leaves the 9 free blocks the pricing page advertises. Being downloadable does not mean they are licensed. Sources: https://shadcnuikit.com/r/store-navigation.json and https://shadcnuikit.com/blocks/ecommerce/store-navigation
- registry.json defines stat-card1 through stat-card4 twice. /r/stat-card1.json serves the Examples 'Sales Overview' card, not the Dashboard UI Stat Card 1 block that the Stat Cards page's install command claims to install. Sources: https://shadcnuikit.com/r/registry.json and https://shadcnuikit.com/r/stat-card1.json
- A full scan of all 556 publicly fetchable registry items: 22 import next/\* (next/image in 11 Carousel variants, item6, item8 and promo-section; next/link in hero1, 4 navigation-menu variants, sidebar-layout, signin-form1 and store-navigation). autocomplete3 and autocomplete4 import @base-ui/react directly. None declares dependencies or registryDependencies. Source: https://shadcnuikit.com/r/registry.json
- Because items have no registryDependencies, `shadcn add @shadcnuikit/table` in this repo (dry run with shadcn 4.11.0, the lockfile version) creates repo-root components/table.tsx importing ~/components/ui/table. That file does not exist in inertia/components/ui, and the CLI will not install it. Missing shadcn primitives and npm packages must be added by hand. Sources: https://shadcnuikit.com/r/table.json and `components.json`
- Page Builder export only targets Next.js. It produces a Next.js App Router project, or a CLI route group for "an existing Next.js app" that removes app/page.tsx. It cannot be used as-is in AdonisJS/Inertia, and export is paid-only. Source: https://shadcnuikit.com/blog/build-a-website-with-shadcn-ui-blocks
- The license bars "tools that allow others to build sites using Shadcn UI Kit components directly". This could affect a multi-vendor marketplace if vendors get a storefront or shop-page customizer built from kit blocks. This is my interpretation and would need the vendor's confirmation. Source: https://shadcnuikit.com/pricing
- The E-commerce admin demo covers single-store product and order CRUD only. It has no customer list, vendor or shop management, payouts, commissions or moderation pages. So DripNepal's vendor dashboard and platform admin would still need custom screens. Source: https://shadcnuikit.com/dashboard/ecommerce
- Directory health breakdown: @shadcnuikit installability is 7.935 and correctness 18.488, versus 19.364 and 24.189 for @commercn. Installability is the main reason for the 'degraded' status. Source: https://ui.shadcn.com/r/registries.json
- Pricing details the claims missed: Pro support is 1-12 hours versus 1-4 hours for Team and Enterprise. Starter support and Theme generator are 'Limited', but Starter includes the CLI and MCP. The actual discounts are about 39%, 50% and 29%, not a uniform 40%. Source: https://shadcnuikit.com/pricing
- The vendor contradicts itself on primitives. /blocks says "Every block is compatible with both Radix UI and Base UI", while the Page Builder guide says the blocks are built on Radix and need a Radix style. The pricing FAQ lists supported technologies only as "Next.js 16, React 19, Tailwind CSS v4, and TypeScript". Sources: https://shadcnuikit.com/blocks and https://shadcnuikit.com/pricing
- bundui.io e-commerce items (category-filters, order-summaries-01, checkout-forms-01) are flagged meta.isPro:true but served publicly. bundui.io's FAQ restricts commercial use to Professional and Enterprise licenses and offers a 3-day refund. The MIT bundui/components repo does not cover these blocks. Sources: https://bundui.io/r/category-filters.json, https://bundui.io/pricing and https://github.com/bundui/components
