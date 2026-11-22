import { test } from '@japa/runner'
import { createServer, type Server } from 'node:net'
import app from '@adonisjs/core/services/app'
import emitter from '@adonisjs/core/services/emitter'
import type { Logger } from '@adonisjs/core/logger'
import { Mailer } from '@adonisjs/mail'
import { SMTPTransport } from '@adonisjs/mail/transports/smtp'
import { withTx } from '#modules/platform/tx'
import { ProviderCallInsideTransaction } from '#exceptions/programming_errors'
import { EmailNotSent, EmailSender, type EmailMessage } from '#modules/platform/ports/email_sender'
import {
  emailSenderFor,
  isPermanentMailError,
  MailEmailSender,
} from '#modules/platform/providers/mail_email_sender'

/*
 * The `EmailSender` port and its mail adapter (docs/03 §11.5):
 * - T-ARCH-003, its email case: the adapter throws inside a transaction;
 * - T-NOT-001, the adapter part: only a refused recipient address is a
 *   permanent failure; a refused sender, a policy refusal, an outage or a
 *   timeout is retryable, so retries and a redrive deliver the rest, and
 *   without SMTP outside tests nothing pretends to send. The job part comes
 *   with `notifications.send_email`.
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

type Line = { level: string; fields: Record<string, unknown>; message: string }

// A logger that keeps each line, to check what a provider.call line holds.
function recordingLogger() {
  const lines: Line[] = []
  const at = (level: string) => (fields: Record<string, unknown>, message: string) =>
    lines.push({ level, fields, message })
  const logger = { info: at('info'), warn: at('warn') } as unknown as Logger
  return { lines, logger }
}

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return typeof address === 'object' && address ? address.port : 0
}

// A port on this machine that nothing listens on.
async function closedPort() {
  const server = createServer()
  const port = await listen(server)
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

// A minimal SMTP server that answers each command verb with the given reply, else 250.
async function smtpStub(replies: Record<string, string>) {
  const server = createServer((socket) => {
    socket.write('220 stub ESMTP\r\n')
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      let end = buffer.indexOf('\r\n')
      while (end >= 0) {
        const verb = buffer.slice(0, end).split(/[ :]/)[0].toUpperCase()
        buffer = buffer.slice(end + 2)
        if (verb === 'QUIT') socket.end('221 bye\r\n')
        else socket.write(`${replies[verb] ?? '250 ok'}\r\n`)
        end = buffer.indexOf('\r\n')
      }
    })
    socket.on('error', () => {})
  })
  const port = await listen(server)
  return { port, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}

function smtpSender(port: number, logger: Logger) {
  const mailer = new Mailer(
    'smtp',
    new SMTPTransport({ host: '127.0.0.1', port, connectionTimeout: 2000 }),
    emitter,
    { from: 'no-reply@example.net' }
  )
  return new MailEmailSender(mailer, logger)
}

async function failureOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e) => e
  )
  if (!(error instanceof EmailNotSent)) throw new Error(`expected EmailNotSent, got ${error}`)
  return error
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

  test('T-ARCH-003 outside a transaction the test mailer sends and logs its name', async ({
    assert,
  }) => {
    // Tests set no SMTP_HOST, so the default mailer is the JSON transport: nothing leaves.
    const mail = await app.container.make('mail.manager')
    const { lines, logger } = recordingLogger()
    const sent = await emailSenderFor(mail.use(), 'test', logger).send(MESSAGE, CTX)
    assert.isAbove(sent.providerMessageId.length, 0)
    assert.lengthOf(lines, 1)
    assert.include(lines[0].fields, {
      provider: 'json',
      outcome: 'sent',
      template: MESSAGE.template,
    })
  })
})

test.group('T-NOT-001 email adapter failures', () => {
  test('T-NOT-001 without SMTP outside tests, a send fails retryably instead of pretending', async ({
    assert,
  }) => {
    const mail = await app.container.make('mail.manager')
    const { lines, logger } = recordingLogger()
    const failure = await failureOf(
      emailSenderFor(mail.use(), 'production', logger).send(MESSAGE, CTX)
    )
    assert.deepInclude(failure, { permanent: false, reason: 'not_configured' })
    assert.equal(lines[0].level, 'warn')
    assert.include(lines[0].fields, { outcome: 'retryable', reason: 'not_configured' })
  })

  test('T-NOT-001 an SMTP server that does not answer is retryable, and the line holds no address', async ({
    assert,
  }) => {
    const { lines, logger } = recordingLogger()
    const failure = await failureOf(smtpSender(await closedPort(), logger).send(MESSAGE, CTX))
    assert.isFalse(failure.permanent)
    assert.notInclude(failure.message, MESSAGE.to)

    assert.lengthOf(lines, 1)
    assert.equal(lines[0].message, 'provider.call')
    assert.equal(lines[0].level, 'warn')
    assert.include(lines[0].fields, {
      provider: 'smtp',
      operation: 'send',
      template: MESSAGE.template,
      outcome: 'retryable',
      request_id: 'req-1',
    })
    assert.isString(lines[0].fields.reason)
    const text = JSON.stringify(lines[0])
    for (const secret of [MESSAGE.to, MESSAGE.subject, MESSAGE.html])
      assert.notInclude(text, secret)
  })

  test('T-NOT-001 a server that refuses the recipient (550 5.1.1) gives a permanent failure', async ({
    assert,
  }) => {
    const stub = await smtpStub({ RCPT: '550 5.1.1 No such user here' })
    try {
      const failure = await failureOf(
        smtpSender(stub.port, recordingLogger().logger).send(MESSAGE, CTX)
      )
      assert.isTrue(failure.permanent)
      assert.notInclude(failure.message, MESSAGE.to)
    } finally {
      await stub.close()
    }
  })

  test('T-NOT-001 a server that refuses the sender (550 on MAIL FROM) gives a retryable failure', async ({
    assert,
  }) => {
    const stub = await smtpStub({ MAIL: '550 5.7.1 Sender address rejected' })
    try {
      const failure = await failureOf(
        smtpSender(stub.port, recordingLogger().logger).send(MESSAGE, CTX)
      )
      assert.isFalse(failure.permanent)
    } finally {
      await stub.close()
    }
  })

  test('T-NOT-001 a send past its time limit, or aborted, is retryable', async ({ assert }) => {
    const hanging = { name: 'smtp', send: () => new Promise<{ messageId: string }>(() => {}) }
    const sender = new MailEmailSender(hanging, recordingLogger().logger)
    const late = await failureOf(sender.send(MESSAGE, { requestId: null, timeoutMs: 20 }))
    assert.deepInclude(late, { permanent: false, reason: 'timeout' })

    const controller = new AbortController()
    const pending = sender.send(MESSAGE, {
      requestId: null,
      timeoutMs: 5000,
      signal: controller.signal,
    })
    controller.abort()
    assert.deepInclude(await failureOf(pending), { permanent: false, reason: 'aborted' })
  })

  test('T-NOT-001 {label} is {verdict}')
    .with([
      {
        label: 'RCPT TO 550 5.1.1, an unknown address',
        error: {
          code: 'EENVELOPE',
          command: 'RCPT TO',
          responseCode: 550,
          response: '550 5.1.1 User unknown',
        },
        verdict: 'permanent',
      },
      {
        label: 'RCPT TO 553, a malformed address',
        error: {
          code: 'EENVELOPE',
          command: 'RCPT TO',
          responseCode: 553,
          response: '553 bad address',
        },
        verdict: 'permanent',
      },
      {
        label: 'nodemailer finding no recipient',
        error: { code: 'EENVELOPE', command: 'API', message: 'No recipients defined' },
        verdict: 'permanent',
      },
      {
        label: 'nodemailer refusing the recipient',
        error: { code: 'EENVELOPE', command: 'API', message: 'Invalid recipient "a"' },
        verdict: 'permanent',
      },
      {
        label: 'RCPT TO 554 5.7.1, a relay refusal',
        error: {
          code: 'EENVELOPE',
          command: 'RCPT TO',
          responseCode: 554,
          response: '554 5.7.1 Relay access denied',
        },
        verdict: 'retryable',
      },
      {
        label: 'RCPT TO 503, a bad sequence',
        error: {
          code: 'EENVELOPE',
          command: 'RCPT TO',
          responseCode: 503,
          response: '503 bad sequence',
        },
        verdict: 'retryable',
      },
      {
        label: 'RCPT TO 450, a busy mailbox',
        error: {
          code: 'EENVELOPE',
          command: 'RCPT TO',
          responseCode: 450,
          response: '450 try later',
        },
        verdict: 'retryable',
      },
      {
        label: 'MAIL FROM 550, a refused sender',
        error: {
          code: 'EENVELOPE',
          command: 'MAIL FROM',
          responseCode: 550,
          response: '550 5.1.0 rejected',
        },
        verdict: 'retryable',
      },
      {
        label: 'DATA 554, a paused account',
        error: {
          code: 'EMESSAGE',
          command: 'DATA',
          responseCode: 554,
          response: '554 sending paused',
        },
        verdict: 'retryable',
      },
      {
        label: 'nodemailer refusing the sender',
        error: { code: 'EENVELOPE', command: 'API', message: 'Invalid sender "a"' },
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
