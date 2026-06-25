import vine from '@vinejs/vine'

/**
 * Shared rules for email and password.
 */
export const email = () => vine.string().email().maxLength(254)
export const password = () => vine.string().minLength(8).maxLength(32)
