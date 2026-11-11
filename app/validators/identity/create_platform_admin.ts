import vine from '@vinejs/vine'
import { accountEmail } from '#validators/support/account_email'

/*
 * The input of `node ace platform:create-admin` (docs/09 §9.1). The email
 * follows the shared account rule (T-IAM-112); the name is 1–100
 * characters in NFC (`users_full_name_check`); the password, asked only by
 * `--interactive` at a masked prompt, follows the signup rule of docs/07
 * §3.7: 10–128 characters, no composition rules.
 */
export const createPlatformAdminValidator = vine.create({
  email: accountEmail(),
  full_name: vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(100)
    .transform((value) => value.normalize('NFC')),
  password: vine.string().minLength(10).maxLength(128).optional(),
})

// The email alone, checked before the command asks whether the account exists.
export const platformAdminEmailValidator = vine.create({ email: accountEmail() })
