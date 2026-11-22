import type { ApplicationService } from '@adonisjs/core/types'
import { EmailSender } from '#modules/platform/ports/email_sender'
import { MailEmailSender } from '#modules/platform/providers/mail_email_sender'

/*
 * Binds each port to its adapter from configuration (docs/03 §11.1, docs/09
 * §1.2): code resolves the port from the container, and a test swaps the
 * binding (`app.container.swap`) for a fake without a code branch. A new
 * adapter per resolution, never a global singleton (docs/09 §3.13).
 */
export default class PortsProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.bind(EmailSender, async (resolver) => {
      const mail = await resolver.make('mail.manager')
      const logger = await resolver.make('logger')
      const mailer = this.app.config.get<string>('mail.default')
      return new MailEmailSender(mail.use(), mailer, logger)
    })
  }
}
