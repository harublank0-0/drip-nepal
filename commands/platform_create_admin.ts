import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { PostgreConfig } from '@adonisjs/lucid/types/database'
import { errors as vineErrors } from '@vinejs/vine'
import type { PgBoss } from 'pg-boss'
import BootstrapPlatformAdmin, {
  AccountNotEligible,
  AdminAlreadyExists,
  ExistingAccountNeedsConfirmation,
  type BootstrapInput,
} from '#modules/identity/actions/bootstrap_platform_admin'
import { accountExistsWithEmail } from '#modules/identity/queries'
import { createJobBoss, hasJobBoss, jobDatabaseOf, setJobBoss } from '#modules/platform/jobs'
import {
  createPlatformAdminValidator,
  platformAdminEmailValidator,
} from '#validators/identity/create_platform_admin'

/*
 * `node ace platform:create-admin` (docs/09 §9.1, FR-ADM-005, RF-05): the
 * one way to create the first platform admin, in every environment.
 *
 * - Default, invitation: `--email` and `--full-name`; the account gets a
 *   password nobody knows and a `password_reset` link by email.
 * - `--interactive`: the password is typed at a masked prompt, twice.
 * - Every mode queues an `mfa_enrollment` link (docs/07 §3.9).
 * - An email that belongs to an existing account is granted the role only
 *   after the operator confirms, and its password is never changed.
 *
 * There is no password flag, so no password reaches shell history or the
 * process list (AC-FR-ADM-005-1). The output names the address masked and
 * never a token. The command parses input and calls the identity entry
 * action, which holds the lock, the checks, the tokens and the audit row.
 * Exit 1 when an unrevoked platform_admin exists. Verified by T-OPS-019.
 */

export const EXISTING_ACCOUNT_PROMPT =
  'This e-mail belongs to an existing account. Grant it platform_admin? Its password is not changed'

type Outcome = Awaited<ReturnType<BootstrapPlatformAdmin['execute']>>

// "60 minutes", "24 hours"
function lifetime(seconds: number) {
  const hours = seconds / 3600
  return Number.isInteger(hours) && hours > 1
    ? `${hours} hours`
    : `${Math.round(seconds / 60)} minutes`
}

export default class PlatformCreateAdmin extends BaseCommand {
  static commandName = 'platform:create-admin'
  static description = 'Create the first platform admin (invitation and TOTP enrolment e-mails)'
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'E-mail of the first admin' })
  declare email?: string

  @flags.string({ description: 'Full name', flagName: 'full-name' })
  declare fullName?: string

  @flags.boolean({ description: 'Ask for a password at a masked prompt instead of an invitation' })
  declare interactive?: boolean

  // Field names and messages only: vine's messages never repeat the value.
  #refuse(error: unknown) {
    if (!(error instanceof vineErrors.E_VALIDATION_ERROR)) throw error
    for (const { field, message } of error.messages as { field: string; message: string }[]) {
      this.logger.error(`${field}: ${message}`)
    }
    this.exitCode = 1
  }

  async #input(): Promise<BootstrapInput | null> {
    const typed = this.email ?? (this.interactive ? await this.prompt.ask('E-mail') : undefined)
    if (!typed) {
      this.logger.error('--email is required (or use --interactive)')
      this.exitCode = 1
      return null
    }
    let email: string
    try {
      ;({ email } = await platformAdminEmailValidator.validate({ email: typed }))
    } catch (error) {
      this.#refuse(error)
      return null
    }

    if (await accountExistsWithEmail(email)) {
      const grant = await this.prompt.confirm(EXISTING_ACCOUNT_PROMPT)
      if (!grant) {
        this.logger.error('Nothing changed')
        this.exitCode = 1
        return null
      }
      return { email, fullName: null, password: null, grantExistingAccount: true }
    }

    const fullName = this.fullName ?? (await this.prompt.ask('Full name'))
    let password: string | undefined
    if (this.interactive) {
      password = await this.prompt.secure('Password (10-128 characters)')
      if ((await this.prompt.secure('Repeat the password')) !== password) {
        this.logger.error('The passwords do not match')
        this.exitCode = 1
        return null
      }
    }
    try {
      const valid = await createPlatformAdminValidator.validate({
        email,
        full_name: fullName,
        password,
      })
      return {
        email: valid.email,
        fullName: valid.full_name,
        password: valid.password ?? null,
        grantExistingAccount: false,
      }
    } catch (error) {
      this.#refuse(error)
      return null
    }
  }

  /*
   * A send-only pg-boss instance as this command's database role, unless
   * the process already has one (a test that set it), so the action's
   * `sendJob` calls have an instance. Stopped when the command ends.
   */
  async #startJobBoss(): Promise<PgBoss | null> {
    if (hasJobBoss()) return null
    const db = await this.app.container.make('lucid.db')
    const config = db.manager.get(db.primaryConnectionName)?.config as PostgreConfig | undefined
    const database = jobDatabaseOf(config)
    if (!database) throw new Error('The default connection must give host, user and database')
    const boss = createJobBoss(database, 'web')
    boss.on('error', (error: Error) => this.logger.error(`pg-boss: ${error.message}`))
    await boss.start()
    setJobBoss(boss)
    return boss
  }

  #report(outcome: Outcome) {
    const to = outcome.maskedEmail
    for (const token of outcome.tokens) {
      if (token.purpose === 'password_reset') {
        this.logger.success(
          `admin invitation queued for ${to}; expires in ${lifetime(token.lifetimeSeconds)}`
        )
      }
    }
    if (outcome.mode === 'interactive') this.logger.success(`platform_admin created for ${to}`)
    if (outcome.mode === 'existing_account') this.logger.success(`platform_admin granted to ${to}`)
    for (const token of outcome.tokens) {
      if (token.purpose === 'mfa_enrollment') {
        this.logger.success(
          `TOTP enrolment link queued; expires in ${lifetime(token.lifetimeSeconds)}`
        )
      }
    }
  }

  async run() {
    const input = await this.#input()
    if (!input) return

    const boss = await this.#startJobBoss()
    try {
      const action = await this.app.container.make(BootstrapPlatformAdmin)
      this.#report(await action.execute(input))
    } catch (error) {
      if (error instanceof AdminAlreadyExists) {
        this.logger.error('An active platform_admin exists; grant roles in /admin instead')
      } else if (error instanceof ExistingAccountNeedsConfirmation) {
        this.logger.error(
          'An account with this e-mail was created meanwhile; run the command again'
        )
      } else if (error instanceof AccountNotEligible) {
        this.logger.error(`${error.message}; it cannot be granted a role`)
      } else {
        throw error
      }
      this.exitCode = 1
    } finally {
      if (boss) {
        setJobBoss(null)
        await boss.stop({ graceful: true, close: true })
      }
    }
  }
}
