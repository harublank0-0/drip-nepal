/*
 * The storefront's navigation entries live in `shared/catalog/navigation.ts`
 * (R1-S part 3d-iii-b), so the storefront header renders the same list the
 * routes are built from. This module re-exports them for the server.
 */
export { NAVIGATION, navigationEntry, type NavigationEntry } from '#shared/catalog/navigation'
