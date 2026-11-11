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
import { accountExistsWithEmail, platformAdminExists } from '#modules/identity/queries'
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
 * - `--interactive`: asks for the e-mail and name, then the password at a
 *   masked prompt, twice. Only the password prompts are masked.
 * - A prompt needs a terminal: without one the command exits 1 at once.
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

export const EMAIL_PROMPT = 'E-mail'
export const NAME_PROMPT = 'Full name'
export const PASSWORD_PROMPT = 'Password (10-128 characters)'
export const REPEAT_PROMPT = 'Repeat the password'
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

  /*
   * Whether a prompt can be answered: on a terminal, or by a test that
   * trapped it. Without one (a release container, `ssh host cmd`, a pipe)
   * the command stops with a clear message instead of hanging or failing
   * inside the prompt library.
   */
  interactiveTerminal = process.stdin.isTTY === true

  #mayAsk(title: string) {
    if (this.interactiveTerminal || this.prompt.traps.prompts.has(title)) return true
    this.logger.error(`"${title}" needs an interactive terminal; run the command with a TTY`)
    this.exitCode = 1
    return false
  }

  async #ask(title: string) {
    return this.#mayAsk(title) ? this.prompt.ask(title) : null
  }

  async #input(): Promise<BootstrapInput | null> {
    const typed = this.email ?? (this.interactive ? await this.#ask(EMAIL_PROMPT) : undefined)
    if (typed === null) return null
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

    // Refuse before any other prompt; the action checks again under its lock.
    if (await platformAdminExists()) {
      this.#adminExists()
      return null
    }

    if (await accountExistsWithEmail(email)) {
      if (!this.#mayAsk(EXISTING_ACCOUNT_PROMPT)) return null
      if (!(await this.prompt.confirm(EXISTING_ACCOUNT_PROMPT))) {
        this.logger.error('Nothing changed')
        this.exitCode = 1
        return null
      }
      return { email, fullName: null, password: null, grantExistingAccount: true }
    }

    const fullName = this.fullName ?? (await this.#ask(NAME_PROMPT))
    if (fullName === null) return null
    let password: string | undefined
    if (this.interactive) {
      if (!this.#mayAsk(PASSWORD_PROMPT) || !this.#mayAsk(REPEAT_PROMPT)) return null
      password = await this.prompt.secure(PASSWORD_PROMPT)
      if ((await this.prompt.secure(REPEAT_PROMPT)) !== password) {
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

  #adminExists() {
    this.logger.error('An active platform_admin exists; grant roles in /admin instead')
    this.exitCode = 1
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
        this.#adminExists()
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
