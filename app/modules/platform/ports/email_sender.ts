import type { CallContext } from '#modules/platform/ports/call_context'

/*
 * The `EmailSender` port (docs/03 §11.1, §11.5), used by the notifications
 * module. The adapter is bound in the container (providers/ports_provider.ts),
 * so tests swap in a capturing fake without a code branch. An abstract class,
 * because the container needs a runtime token.
 */
export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
  // The template name, as `notification_deliveries.template` stores it.
  template: string
  // Passed to the provider where its transport has one; SMTP has none.
  idempotencyKey: string
}

export type EmailSent = { providerMessageId: string }

/*
 * A send that did not happen. `permanent` is true when a retry cannot help
 * (the server refused the message or the recipient); the job then marks the
 * delivery `failed`. Otherwise the job retries (docs/03 §9 `notifications.send_email`).
 * The message never holds the address or the body.
 */
export class EmailNotSent extends Error {
  constructor(
    readonly permanent: boolean,
    readonly reason: string
  ) {
    super(`Email not sent (${permanent ? 'permanent' : 'retryable'}): ${reason}`)
    this.name = 'EmailNotSent'
  }
}

export abstract class EmailSender {
  abstract send(message: EmailMessage, ctx: CallContext): Promise<EmailSent>
}
