import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'
import { JSONTransport } from '@adonisjs/mail/transports/json'

/*
 * Email (docs/09 §6.1, docs/03 §11.5). The `EmailSender` port's adapter
 * (app/modules/platform/providers/mail_email_sender.ts) sends through the
 * default mailer:
 * - `smtp` when SMTP_HOST is set: Mailpit in development, the provider OD-08
 *   picks in staging and production, where TLS is required;
 * - `json` otherwise: tests and the web process, which send no email
 *   (docs/11 §4.5). It builds the message and sends nothing.
 * `sendLater` is not used: the notification jobs queue and dedupe the
 * emails (docs/03 §11.5).
 */
const smtpHost = env.get('SMTP_HOST')
const username = env.get('SMTP_USERNAME')
const deployed = ['staging', 'production'].includes(env.get('APP_ENV'))

const mailConfig = defineConfig({
  default: smtpHost ? 'smtp' : 'json',
  from: {
    address: env.get('MAIL_FROM_ADDRESS') ?? 'no-reply@dripnepal.invalid',
    name: env.get('MAIL_FROM_NAME') ?? 'DripNepal',
  },
  mailers: {
    smtp: transports.smtp({
      host: smtpHost ?? '127.0.0.1',
      port: env.get('SMTP_PORT') ?? 587,
      requireTLS: deployed,
      auth: username
        ? { type: 'login', user: username, pass: env.get('SMTP_PASSWORD')?.release() ?? '' }
        : undefined,
      // An unanswered server fails the attempt, and the job retries it (docs/03 §9).
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    }),
    json: () => new JSONTransport(),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
