import type { Logger } from '@adonisjs/core/logger'
import type { MessageComposeCallback } from '@adonisjs/mail/types'
import { PortAdapter } from '#modules/platform/ports/port_adapter'
import type { CallContext } from '#modules/platform/ports/call_context'
import {
  EmailNotSent,
  type EmailMessage,
  type EmailSender,
  type EmailSent,
} from '#modules/platform/ports/email_sender'

/*
 * The `EmailSender` adapter over `@adonisjs/mail` (docs/03 §11.5): SMTP to
 * Mailpit in development, the provider of OD-08 in staging and production,
 * the JSON transport where SMTP is unset (config/mail.ts).
 *
 * - Never inside a transaction: `guard` throws first (docs/03 §11.4, T-ARCH-003).
 * - One `provider.call` log line per send, with the template, outcome and
 *   duration; never the address, subject, body or link (docs/09 §7.2, §7.4).
 * - A failure becomes `EmailNotSent`: permanent only when the server refused
 *   the recipient or the message; an outage, a timeout or a login failure
 *   is retryable, so a fixed configuration lets the retries succeed.
 * - SMTP has no idempotency key: a timeout whose message did go out can be
 *   sent again by the retry. The delivery row's compare-and-set keeps it to
 *   one send per successful attempt (docs/03 §9).
 */
export type MailTransport = {
  send(compose: MessageComposeCallback): Promise<{ messageId: string }>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

// Whether a nodemailer error is final for this message (SMTP 5xx on the envelope or the data).
export function isPermanentMailError(error: unknown): boolean {
  if (!isRecord(error)) return false
  const code = error.code
  const reply = error.responseCode
  if (code === 'EENVELOPE' && typeof reply !== 'number') return true // no usable recipient
  return (
    (code === 'EENVELOPE' || code === 'EMESSAGE') &&
    typeof reply === 'number' &&
    reply >= 500 &&
    reply < 600
  )
}

// A short reason without the address: nodemailer messages can quote the recipient.
function reasonOf(error: unknown) {
  if (!isRecord(error)) return 'error'
  const code = typeof error.code === 'string' ? error.code : 'error'
  return typeof error.responseCode === 'number' ? `${code} ${error.responseCode}` : code
}

export class MailEmailSender extends PortAdapter implements EmailSender {
  protected readonly adapterName = 'MailEmailSender'

  constructor(
    private readonly transport: MailTransport,
    private readonly provider: string,
    private readonly logger: Logger
  ) {
    super()
  }

  async send(message: EmailMessage, ctx: CallContext): Promise<EmailSent> {
    this.guard('send')
    const started = performance.now()
    const log = (outcome: string) =>
      this.logger.info(
        {
          provider: this.provider,
          operation: 'send',
          template: message.template,
          outcome,
          duration_ms: Math.round(performance.now() - started),
          request_id: ctx.requestId,
        },
        'provider.call'
      )

    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new EmailNotSent(false, 'timeout')), ctx.timeoutMs)
    })
    try {
      const sent = await Promise.race([
        this.transport.send((mail) => {
          mail.to(message.to).subject(message.subject).html(message.html).text(message.text)
        }),
        timeout,
      ])
      log('sent')
      return { providerMessageId: sent.messageId }
    } catch (error) {
      const failure =
        error instanceof EmailNotSent
          ? error
          : new EmailNotSent(isPermanentMailError(error), reasonOf(error))
      log(failure.permanent ? 'permanent' : 'retryable')
      throw failure
    } finally {
      clearTimeout(timer)
    }
  }
}
