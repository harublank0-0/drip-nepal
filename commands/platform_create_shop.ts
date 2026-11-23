import { randomUUID } from 'node:crypto'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { errors as vineErrors } from '@vinejs/vine'
import BootstrapOwnerShop, {
  OwnerHasShop,
  OwnerNotEligible,
  ShopSlugTaken,
  type OwnerShopInput,
} from '#modules/shops/actions/bootstrap_owner_shop'
import { accountByEmail } from '#modules/identity/queries'
import { ownsAnyShop } from '#modules/shops/queries'
import { maskEmail } from '#shared/format/email'
import {
  createOwnerShopValidator,
  ownerAndSlugValidator,
} from '#validators/shops/create_owner_shop'

/*
 * `node ace platform:create-shop` (docs/09 §9.8, proposed; docs/12 §9 part
 * 1): creates the product owner's own shop for the single-seller launch,
 * active at once, with no application or review, and records the owner's
 * acceptance of the current seller agreement version (a draft, 04a §6.4).
 *
 * - `--owner` names an existing `active` account by its email; the owner
 *   signs up (and, for R1-S, is made platform admin by
 *   `platform:create-admin`) first.
 * - `--slug`, `--name`, `--contact-email`, `--contact-phone`,
 *   `--business-type` and `--return-policy` give the columns the shop needs
 *   (04a §6.1); one left out is asked for at a prompt. A
 *   `registered_business` also takes `--registration-number`,
 *   `--registration-authority` and `--pan-vat-number`; `--vat-registered`
 *   needs the PAN/VAT number.
 * - The grievance contact's name and phone are personal values (04a §15.3;
 *   the phone Sensitive-personal and stored encrypted, 07 §5.5), so they
 *   have no flag: both are always asked at a prompt and never reach shell
 *   history or the process list.
 * - The owner's email and the slug are checked first, then whether the
 *   owner exists, is `active` and owns no shop, all before any prompt, as
 *   `platform:create-admin` refuses early (docs/09 §9.1); the action checks
 *   the owner again under its locks.
 * - A prompt needs a terminal: without one the command exits 1 at once.
 *
 * The output names the owner's address masked and the run's ID, which the
 * agreement row and the audit row carry as `request_id`. The command
 * parses input and calls the shops entry action, which holds the locks,
 * the checks and the audit row. Exit 1, with nothing written, for an
 * unknown or inactive owner, an owner who already owns a shop (so a second
 * run changes nothing), a taken, reserved or malformed slug, or invalid
 * input. No TOTP is asked: see docs/09 §9.8 "Why no TOTP".
 * Verified by T-SHOP-007.
 */

export const NAME_PROMPT = 'Shop name (2-60 characters)'
export const CONTACT_EMAIL_PROMPT = "Shop contact e-mail (public; not the owner's own)"
export const CONTACT_PHONE_PROMPT = 'Shop contact phone (public; mobile or landline)'
export const BUSINESS_TYPE_PROMPT = 'Business type (individual or registered_business)'
export const GRIEVANCE_NAME_PROMPT = 'Grievance contact name'
export const GRIEVANCE_PHONE_PROMPT = 'Grievance contact phone (mobile or landline)'
export const RETURN_POLICY_PROMPT = 'Return policy shown on product pages (one line)'

export default class PlatformCreateShop extends BaseCommand {
  static commandName = 'platform:create-shop'
  static description =
    "Create the owner's shop for the single-seller launch, active, with the seller agreement recorded"
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: "E-mail of the owner's existing active account" })
  declare owner?: string

  @flags.string({ description: 'Shop slug (3-40 characters: a-z, 0-9 and hyphens)' })
  declare slug?: string

  @flags.string({ description: 'Shop name' })
  declare name?: string

  @flags.string({ description: 'Public shop contact e-mail', flagName: 'contact-email' })
  declare contactEmail?: string

  @flags.string({ description: 'Public shop contact phone', flagName: 'contact-phone' })
  declare contactPhone?: string

  @flags.string({
    description: 'individual or registered_business',
    flagName: 'business-type',
  })
  declare businessType?: string

  @flags.string({ description: 'Company registration number', flagName: 'registration-number' })
  declare registrationNumber?: string

  @flags.string({
    description: 'Registering authority, such as the Office of the Company Registrar',
    flagName: 'registration-authority',
  })
  declare registrationAuthority?: string

  @flags.string({ description: 'PAN or VAT number (9 digits)', flagName: 'pan-vat-number' })
  declare panVatNumber?: string

  @flags.boolean({ description: 'The business is VAT-registered', flagName: 'vat-registered' })
  declare vatRegistered?: boolean

  @flags.string({ description: 'Return policy text', flagName: 'return-policy' })
  declare returnPolicy?: string

  // Field names and messages only: vine's messages never repeat the value.
  #refuse(error: unknown) {
    if (!(error instanceof vineErrors.E_VALIDATION_ERROR)) throw error
    for (const { field, message } of error.messages as { field: string; message: string }[]) {
      this.logger.error(`${field}: ${message}`)
    }
    this.exitCode = 1
  }

  /*
   * Whether a prompt can be answered: on a terminal, or by a test that
   * trapped it. Without one the command stops with a clear message instead
   * of hanging, as `platform:create-admin` does (docs/09 §9.1).
   */
  interactiveTerminal = process.stdin.isTTY === true

  async #ask(title: string): Promise<string | null> {
    if (this.interactiveTerminal || this.prompt.traps.prompts.has(title)) {
      return this.prompt.ask(title)
    }
    this.logger.error(`"${title}" needs an interactive terminal; run the command with a TTY`)
    this.exitCode = 1
    return null
  }

  async #input(): Promise<OwnerShopInput | null> {
    if (!this.owner || !this.slug) {
      this.logger.error('--owner and --slug are required')
      this.exitCode = 1
      return null
    }
    let ownerEmail: string
    try {
      ;({ owner_email: ownerEmail } = await ownerAndSlugValidator.validate({
        owner_email: this.owner,
        slug: this.slug,
      }))
    } catch (error) {
      this.#refuse(error)
      return null
    }
    // Refuse before any prompt; the action checks again under its locks.
    const owner = await accountByEmail(ownerEmail)
    if (!owner || owner.status !== 'active') {
      this.#ownerNotEligible(owner?.status ?? null)
      return null
    }
    if (await ownsAnyShop(owner.userId)) {
      this.#ownerHasShop()
      return null
    }

    const values: Record<string, string> = {}
    const asked: [key: string, flag: string | undefined, prompt: string][] = [
      ['name', this.name, NAME_PROMPT],
      ['contact_email', this.contactEmail, CONTACT_EMAIL_PROMPT],
      ['contact_phone', this.contactPhone, CONTACT_PHONE_PROMPT],
      ['business_type', this.businessType, BUSINESS_TYPE_PROMPT],
      // Never a flag (the header): always asked.
      ['grievance_contact_name', undefined, GRIEVANCE_NAME_PROMPT],
      ['grievance_contact_phone', undefined, GRIEVANCE_PHONE_PROMPT],
      ['return_policy_text', this.returnPolicy, RETURN_POLICY_PROMPT],
    ]
    for (const [key, flag, prompt] of asked) {
      const value = flag ?? (await this.#ask(prompt))
      if (value === null) return null
      values[key] = value
    }

    try {
      const valid = await createOwnerShopValidator.validate({
        owner_email: this.owner,
        slug: this.slug,
        ...values,
        business_registration_number: this.registrationNumber,
        business_registration_authority: this.registrationAuthority,
        pan_vat_number: this.panVatNumber,
        is_vat_registered: this.vatRegistered === true,
      })
      return {
        ownerEmail: valid.owner_email,
        slug: valid.slug,
        name: valid.name,
        contactEmail: valid.contact_email,
        contactPhoneE164: valid.contact_phone,
        businessType: valid.business_type,
        businessRegistrationNumber: valid.business_registration_number ?? null,
        businessRegistrationAuthority: valid.business_registration_authority ?? null,
        panVatNumber: valid.pan_vat_number ?? null,
        isVatRegistered: valid.is_vat_registered,
        grievanceContactName: valid.grievance_contact_name,
        grievanceContactPhoneE164: valid.grievance_contact_phone,
        returnPolicyText: valid.return_policy_text,
        runId: randomUUID(),
      }
    } catch (error) {
      this.#refuse(error)
      return null
    }
  }

  async run() {
    const input = await this.#input()
    if (!input) return

    const action = await this.app.container.make(BootstrapOwnerShop)
    try {
      const shop = await action.execute(input)
      const agreement = `${shop.agreementVersion}${shop.agreementIsFinal ? '' : ' (draft)'}`
      this.logger.success(
        `shop ${shop.slug} created and active, owned by ${maskEmail(input.ownerEmail)}; ` +
          `seller agreement ${agreement} recorded; run ${input.runId}`
      )
    } catch (error) {
      if (error instanceof OwnerNotEligible) {
        this.#ownerNotEligible(error.status)
      } else if (error instanceof OwnerHasShop) {
        this.#ownerHasShop()
      } else if (error instanceof ShopSlugTaken) {
        this.logger.error('Another shop holds this slug; choose another')
        this.exitCode = 1
      } else {
        throw error
      }
    }
  }

  // Null status: no account holds the email.
  #ownerNotEligible(status: string | null) {
    this.logger.error(
      status === null
        ? 'No account holds this e-mail; the owner signs up first'
        : `The owner's account is ${status}; only an active account can own the shop`
    )
    this.exitCode = 1
  }

  #ownerHasShop() {
    this.logger.error('This account already owns a shop; nothing changed')
    this.exitCode = 1
  }
}
