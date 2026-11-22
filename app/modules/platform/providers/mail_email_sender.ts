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
 * the JSON transport in tests (config/mail.ts).
 *
 * - Never inside a transaction: `guard` throws first (docs/03 §11.4, T-ARCH-003).
 * - One `provider.call` line per send: the mailer, the template, the outcome,
 *   a reason on failure (an error code and SMTP reply code) and the duration;
 *   never the address, subject, body or link (docs/09 §7.2, §7.4).
 * - A failure becomes `EmailNotSent`. It is permanent only when the server
 *   refused the recipient's address (docs/03 §9: "an address the provider
 *   rejects as invalid"): `RCPT TO` with a 5.1.x status, or with 550, 551
 *   or 553 and no enhanced status. A refused sender, a suspended account, a
 *   policy refusal, a full mailbox, an outage, a timeout or a login failure
 *   is retryable, so the retries and a redrive deliver once it is fixed
 *   (docs/11 §10.10). The provider's reply table is checked when OD-08 picks it.
 * - The time limit and `CallContext.signal` end the wait, not the SMTP
 *   conversation: a message that still goes out can be sent again by the
 *   retry, because SMTP has no idempotency key.
 */
export type MailTransport = {
  readonly name: string
  send(compose: MessageComposeCallback): Promise<{ messageId: string }>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

// The enhanced status of a reply ("550 5.1.1 …"), when the server sends one.
const ENHANCED_STATUS = /^\d{3}[ -](\d)\.(\d{1,3})\.\d{1,3}\b/

// Without an enhanced status, the replies that refuse the mailbox itself (RFC 5321 §4.2.3).
const ADDRESS_REPLIES = new Set([550, 551, 553])

// Whether a nodemailer error is final for this message: the server refused the recipient's address.
export function isPermanentMailError(error: unknown): boolean {
  if (!isRecord(error) || error.code !== 'EENVELOPE') return false
  if (error.command === 'API') {
    // nodemailer refused the envelope before any SMTP command: no or an unusable recipient.
    const text = typeof error.message === 'string' ? error.message : ''
    return text.startsWith('No recipients defined') || text.startsWith('Invalid recipient')
  }
  const reply = error.responseCode
  if (error.command !== 'RCPT TO' || typeof reply !== 'number') return false
  if (reply < 500 || reply >= 600) return false
  // With an enhanced status, only 5.1.x is about the address (5.7.x is policy, 5.2.x and
  // 5.4.x the mailbox or the network); without one, only the mailbox replies.
  const status = ENHANCED_STATUS.exec(typeof error.response === 'string' ? error.response : '')
  if (status) return status[1] === '5' && status[2] === '1'
  return ADDRESS_REPLIES.has(reply)
}

// A short reason without the address: nodemailer messages can quote the recipient.
function reasonOf(error: unknown) {
  if (!isRecord(error)) return 'error'
  const code = typeof error.code === 'string' ? error.code : 'error'
  return typeof error.responseCode === 'number' ? `${code} ${error.responseCode}` : code
}

// Rejects when the time limit passes or the caller aborts, whichever comes first.
function deadline(ctx: CallContext) {
  const signal = ctx.signal
    ? AbortSignal.any([AbortSignal.timeout(ctx.timeoutMs), ctx.signal])
    : AbortSignal.timeout(ctx.timeoutMs)
  let stop = () => {}
  const reached = new Promise<never>((_, reject) => {
    const fail = () => reject(new EmailNotSent(false, ctx.signal?.aborted ? 'aborted' : 'timeout'))
    if (signal.aborted) return fail()
    signal.addEventListener('abort', fail, { once: true })
    stop = () => signal.removeEventListener('abort', fail)
  })
  return { reached, stop }
}

export class MailEmailSender extends PortAdapter implements EmailSender {
  protected readonly adapterName = 'MailEmailSender'

  constructor(
    private readonly transport: MailTransport,
    private readonly logger: Logger
  ) {
    super()
  }

  async send(message: EmailMessage, ctx: CallContext): Promise<EmailSent> {
    this.guard('send')
    const started = performance.now()
    const fields = (outcome: string, reason?: string) => ({
      provider: this.transport.name,
      operation: 'send',
      template: message.template,
      outcome,
      ...(reason ? { reason } : {}),
      duration_ms: Math.round(performance.now() - started),
      request_id: ctx.requestId,
    })

    if (ctx.signal?.aborted) {
      // Cancelled before it started: nothing goes out, so the retry cannot duplicate it.
      this.logger.warn(fields('retryable', 'aborted'), 'provider.call')
      throw new EmailNotSent(false, 'aborted')
    }
    const limit = deadline(ctx)
    try {
      const sent = await Promise.race([
        this.transport.send((mail) => {
          mail.to(message.to).subject(message.subject).html(message.html).text(message.text)
        }),
        limit.reached,
      ])
      this.logger.info(fields('sent'), 'provider.call')
      return { providerMessageId: sent.messageId }
    } catch (error) {
      const failure =
        error instanceof EmailNotSent
          ? error
          : new EmailNotSent(isPermanentMailError(error), reasonOf(error))
      this.logger.warn(
        fields(failure.permanent ? 'permanent' : 'retryable', failure.reason),
        'provider.call'
      )
      throw failure
    } finally {
      limit.stop()
    }
  }
}

/*
 * The sender when no SMTP server is configured outside tests: the default
 * mailer is then the JSON transport, which sends nothing, so reporting
 * success would mark deliveries sent that never left. Every send fails
 * retryably instead, and logs why, until SMTP_HOST is set.
 */
export class UnconfiguredEmailSender extends PortAdapter implements EmailSender {
  protected readonly adapterName = 'UnconfiguredEmailSender'

  constructor(private readonly logger: Logger) {
    super()
  }

  async send(message: EmailMessage, ctx: CallContext): Promise<EmailSent> {
    this.guard('send')
    this.logger.warn(
      {
        provider: 'none',
        operation: 'send',
        template: message.template,
        outcome: 'retryable',
        reason: 'not_configured',
        duration_ms: 0,
        request_id: ctx.requestId,
      },
      'provider.call'
    )
    throw new EmailNotSent(false, 'not_configured')
  }
}

// The adapter for a mailer: the JSON transport stands in only under APP_ENV=test.
export function emailSenderFor(transport: MailTransport, appEnv: string, logger: Logger) {
  if (transport.name === 'json' && appEnv !== 'test') return new UnconfiguredEmailSender(logger)
  return new MailEmailSender(transport, logger)
}
