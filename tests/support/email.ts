import app from '@adonisjs/core/services/app'
import type { CallContext } from '#modules/platform/ports/call_context'
import {
  EmailNotSent,
  EmailSender,
  type EmailMessage,
  type EmailSent,
} from '#modules/platform/ports/email_sender'
import { PortAdapter } from '#modules/platform/ports/port_adapter'

/*
 * The capturing `EmailSender` of docs/03 §11.1 and docs/10 §3.6: it keeps
 * each message instead of sending it, so a test asserts the recipient, the
 * template and the values in the plain-text part, never the HTML. Like the
 * real adapter it extends `PortAdapter`, so a send inside a `withTx`
 * transaction throws (T-ARCH-003). `failNext` makes the next sends fail
 * with `EmailNotSent`, retryably or permanently, as the mail adapter does;
 * `throwNext` makes the next one throw any other error, as a bug would.
 *
 *   const emails = captureEmails()   // in group.each.setup, returning emails.restore
 *   emails.fake.failNext('retryable')
 */
export class CapturingEmailSender extends PortAdapter implements EmailSender {
  protected readonly adapterName = 'CapturingEmailSender'
  readonly sent: EmailMessage[] = []
  readonly contexts: CallContext[] = []
  #failures: Error[] = []

  failNext(kind: 'retryable' | 'permanent', options: { times?: number; reason?: string } = {}) {
    const reason = options.reason ?? (kind === 'permanent' ? 'recipient_refused' : 'timeout')
    for (let n = 0; n < (options.times ?? 1); n++) {
      this.#failures.push(new EmailNotSent(kind === 'permanent', reason))
    }
    return this
  }

  throwNext(error: Error) {
    this.#failures.push(error)
    return this
  }

  async send(message: EmailMessage, ctx: CallContext): Promise<EmailSent> {
    this.guard('send')
    this.contexts.push(ctx)
    const failure = this.#failures.shift()
    if (failure) throw failure
    this.sent.push(message)
    return { providerMessageId: `fake-${this.sent.length}` }
  }
}

// Binds a fresh capturing fake to the `EmailSender` port; `restore` puts the real adapter back.
export function captureEmails() {
  const fake = new CapturingEmailSender()
  app.container.swap(EmailSender, () => fake)
  return { fake, restore: () => app.container.restore(EmailSender) }
}
