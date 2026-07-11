# Shop Management Refactor

## Progress

- [x] **Milestone 1: Infrastructure** — Create `shop-management/` directory, move shared files, create Provider + Layout + Sidebar + routes + controller
- [x] **Milestone 2: Overview + General** — Layout bindings + enhanced Overview with quick stats/performance/quick-actions
- [x] **Milestone 3: Branding + Business Hours** — Already complete as thin wrappers
- [ ] **Milestone 4: Shipping + Payments**
- [ ] **Milestone 5: Notifications + SEO**
- [ ] **Milestone 6: Policies + Social**
- [ ] **Milestone 7: Analytics + Security**
- [x] **Milestone 8: Cleanup** — Deleted old `shop_management/` directory, redirected old `dashboard/index.tsx` to `/vendor/shop/overview`, removed stale entries from `pages.d.ts`
- [x] **Milestone 9: Routes** — Wire backend routes + controller (done alongside infrastructure)

## Architecture

All pages share state via `ShopManagementProvider` context.
Each page wraps the existing form component from `shop_management/components/`.
Old `dashboard/index.tsx` remains unchanged until cleanup.
