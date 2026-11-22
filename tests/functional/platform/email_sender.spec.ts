import { test } from '@japa/runner'
import { createServer } from 'node:net'
import app from '@adonisjs/core/services/app'
import emitter from '@adonisjs/core/services/emitter'
import type { Logger } from '@adonisjs/core/logger'
import { Mailer } from '@adonisjs/mail'
import { SMTPTransport } from '@adonisjs/mail/transports/smtp'
import { withTx } from '#modules/platform/tx'
import { ProviderCallInsideTransaction } from '#exceptions/programming_errors'
import { EmailNotSent, EmailSender, type EmailMessage } from '#modules/platform/ports/email_sender'
import {
  isPermanentMailError,
  MailEmailSender,
} from '#modules/platform/providers/mail_email_sender'

/*
 * The `EmailSender` port and its mail adapter (docs/03 §11.5):
 * - T-ARCH-003, its email case: the adapter throws inside a transaction;
 * - T-NOT-001, the adapter part: an SMTP outage is a retryable failure, and
 *   only a refused recipient or message is permanent, so retries and the
 *   dead-letter redrive can deliver the rest. The job part comes with
 *   `notifications.send_email`.
 */

const MESSAGE: EmailMessage = {
  to: 'someone@example.net',
  subject: 'Reset your password',
  html: '<p>Reset</p>',
  text: 'Reset',
  template: 'identity.password_reset',
  idempotencyKey: 'delivery-1',
}
const CTX = { requestId: 'req-1', timeoutMs: 5000 }

// A logger that keeps each line's fields, to check what a provider.call line holds.
function recordingLogger() {
  const lines: { fields: Record<string, unknown>; message: string }[] = []
  const logger = {
    info: (fields: Record<string, unknown>, message: string) => lines.push({ fields, message }),
  } as unknown as Logger
  return { lines, logger }
}

// A port on this machine that nothing listens on.
async function closedPort() {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return typeof address === 'object' && address ? address.port : 1
}

test.group('T-ARCH-003 email adapter and transactions', () => {
  test('T-ARCH-003 the bound EmailSender refuses to send inside a transaction', async ({
    assert,
  }) => {
    const sender = await app.container.make(EmailSender)
    const error = await withTx(() => sender.send(MESSAGE, CTX)).then(
      () => null,
      (e) => e
    )
    assert.instanceOf(error, ProviderCallInsideTransaction)
  })

  test('T-ARCH-003 outside a transaction it sends through the configured mailer', async ({
    assert,
  }) => {
    // Tests set no SMTP_HOST, so the default mailer is the JSON transport: nothing leaves.
    const sender = await app.container.make(EmailSender)
    const sent = await sender.send(MESSAGE, CTX)
    assert.isString(sent.providerMessageId)
    assert.isAbove(sent.providerMessageId.length, 0)
  })
})

test.group('T-NOT-001 email adapter failures', () => {
  test('T-NOT-001 an SMTP server that does not answer is a retryable failure', async ({
    assert,
  }) => {
    const port = await closedPort()
    const mailer = new Mailer(
      'smtp',
      new SMTPTransport({ host: '127.0.0.1', port, connectionTimeout: 2000 }),
      emitter,
      { from: 'no-reply@example.net' }
    )
    const { lines, logger } = recordingLogger()
    const sender = new MailEmailSender(mailer, 'smtp', logger)

    const error = await sender.send(MESSAGE, CTX).then(
      () => null,
      (e) => e
    )
    assert.instanceOf(error, EmailNotSent)
    assert.isFalse((error as EmailNotSent).permanent)
    assert.notInclude((error as EmailNotSent).message, MESSAGE.to)

    // One provider.call line: template and outcome, never the address, subject or body.
    assert.lengthOf(lines, 1)
    assert.equal(lines[0].message, 'provider.call')
    assert.include(lines[0].fields, {
      provider: 'smtp',
      operation: 'send',
      template: MESSAGE.template,
      outcome: 'retryable',
      request_id: 'req-1',
    })
    const text = JSON.stringify(lines[0])
    for (const secret of [MESSAGE.to, MESSAGE.subject, MESSAGE.html])
      assert.notInclude(text, secret)
  })

  test('T-NOT-001 a send that outlasts its time limit is a retryable failure', async ({
    assert,
  }) => {
    const { logger } = recordingLogger()
    const hanging = { send: () => new Promise<{ messageId: string }>(() => {}) }
    const sender = new MailEmailSender(hanging, 'smtp', logger)
    const error = await sender.send(MESSAGE, { requestId: null, timeoutMs: 20 }).then(
      () => null,
      (e) => e
    )
    assert.instanceOf(error, EmailNotSent)
    assert.deepInclude(error, { permanent: false, reason: 'timeout' })
  })

  test('T-NOT-001 {label} is {verdict}')
    .with([
      {
        label: 'a refused recipient (550)',
        error: { code: 'EENVELOPE', responseCode: 550 },
        verdict: 'permanent',
      },
      {
        label: 'a refused message (554)',
        error: { code: 'EMESSAGE', responseCode: 554 },
        verdict: 'permanent',
      },
      { label: 'no usable recipient', error: { code: 'EENVELOPE' }, verdict: 'permanent' },
      {
        label: 'a busy server (421)',
        error: { code: 'EENVELOPE', responseCode: 421 },
        verdict: 'retryable',
      },
      {
        label: 'a login failure (535)',
        error: { code: 'EAUTH', responseCode: 535 },
        verdict: 'retryable',
      },
      { label: 'a refused connection', error: { code: 'ECONNECTION' }, verdict: 'retryable' },
      { label: 'a socket timeout', error: { code: 'ETIMEDOUT' }, verdict: 'retryable' },
      { label: 'something that is not an error object', error: 'boom', verdict: 'retryable' },
    ])
    .run(({ assert }, { error, verdict }) => {
      assert.equal(isPermanentMailError(error), verdict === 'permanent')
    })
})
