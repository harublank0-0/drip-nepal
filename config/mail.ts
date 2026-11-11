import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'

const port = env.get('SMTP_PORT') ?? 587
const username = env.get('SMTP_USERNAME')

/*
 * One SMTP mailer, configured only from env. The email provider is still
 * open (OD-08), so none is built in: a Gmail app password works for the
 * first alerts, and Resend, Brevo or SES can replace it later by changing
 * the same variables (each offers SMTP). Without SMTP_HOST and MAIL_FROM,
 * mail is off and order alerts are skipped (OrderAlerts).
 */
const mailConfig = defineConfig({
  default: 'smtp',
  from: env.get('MAIL_FROM'),
  mailers: {
    smtp: transports.smtp({
      host: env.get('SMTP_HOST') ?? 'localhost',
      port,
      secure: port === 465,
      auth: username
        ? { type: 'login', user: username, pass: env.get('SMTP_PASSWORD')?.release() ?? '' }
        : undefined,
    }),
  },
})

export function isMailConfigured() {
  return Boolean(env.get('SMTP_HOST') && env.get('MAIL_FROM'))
}

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
