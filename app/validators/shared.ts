import vine from '@vinejs/vine'

/**
 * Shared rules for email and password.
 */
export const email = (maxLength = 254) => vine.string().email().maxLength(maxLength)

/*
 * The longest email a new account can have: users.email is varchar(100)
 * until the M0 schema re-baseline (docs/04a: citext). A longer one would
 * fail the insert with a 500 instead of a message.
 */
export const ACCOUNT_EMAIL_MAX = 100
export const password = () => vine.string().minLength(8).maxLength(128)
