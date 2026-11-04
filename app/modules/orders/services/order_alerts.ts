import logger from '@adonisjs/core/services/logger'
import mail from '@adonisjs/mail/services/main'
import { isMailConfigured } from '#config/mail'
import Order from '#models/order'
import NewOrderAlert from '#modules/orders/mails/new_order_alert'

type AlertMailer = { send(alert: NewOrderAlert): Promise<unknown> }

// Emails sent at once for one checkout. Mail servers limit concurrent
// connections (each send opens one), so a checkout with many shops sends
// a few at a time rather than all together.
const PARALLEL_SENDS = 3

let warnedNotConfigured = false

/*
 * Emails each shop when a checkout places an order with it. Checkout
 * calls `sendInBackground` after its transaction commits, so a slow or
 * failing mail server never holds up or fails an order. A failed send is
 * retried (by default 30 s and then 90 s later) and then given up; the
 * seller dashboard's order count (FR-NOT-003) still shows the order.
 *
 * In v1 the retries live in this process: an alert still retrying when the
 * server restarts is lost. M0's job queue (ADR-0010) replaces this.
 * Logs carry the order number, never an email address (docs/09 §7).
 */
export default class OrderAlerts {
  #enabled: boolean
  // Off because mail isn't configured, not because the caller turned it off.
  #offForLackOfMail: boolean
  #mailer: AlertMailer
  #retryDelaysMs: number[]

  constructor({
    enabled,
    mailer = { send: (alert: NewOrderAlert) => mail.send(alert) },
    retryDelaysMs = [30_000, 90_000],
  }: { enabled?: boolean; mailer?: AlertMailer; retryDelaysMs?: number[] } = {}) {
    this.#enabled = enabled ?? isMailConfigured()
    this.#offForLackOfMail = enabled === undefined && !this.#enabled
    this.#mailer = mailer
    this.#retryDelaysMs = retryDelaysMs
  }

  sendInBackground(orderNumbers: string[]) {
    void this.sendNewOrderAlerts(orderNumbers)
  }

  /*
   * Sends one email per order, to the shop owner and the shop's contact
   * address. Never throws.
   */
  async sendNewOrderAlerts(orderNumbers: string[]) {
    if (!this.#enabled) {
      if (this.#offForLackOfMail && !warnedNotConfigured) {
        warnedNotConfigured = true
        logger.warn('Mail is not configured (SMTP_HOST, MAIL_FROM): new-order emails are off')
      }
      return
    }

    try {
      const orders = await Order.query()
        .whereIn('order_number', orderNumbers)
        .preload('items')
        .preload('shop', (shop) => shop.preload('owner'))

      // A few at a time, so one shop's failing email (and its retries)
      // doesn't hold up the other shops' emails from the same checkout.
      const waiting = [...orders]
      const sender = async () => {
        for (let order = waiting.shift(); order; order = waiting.shift()) {
          await this.#sendWithRetries(order)
        }
      }
      await Promise.all(Array.from({ length: Math.min(PARALLEL_SENDS, waiting.length) }, sender))
    } catch (error) {
      logger.error(
        { orderNumbers, err: (error as Error).name },
        'Could not prepare new-order emails'
      )
    }
  }

  async #sendWithRetries(order: Order) {
    const recipients = this.#recipients(order)
    if (recipients.length === 0) return

    const attempts = this.#retryDelaysMs.length + 1
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.#mailer.send(new NewOrderAlert(order, recipients))
        return
      } catch (error) {
        const code = (error as { code?: string }).code ?? (error as Error).name
        logger.warn({ orderNumber: order.orderNumber, attempt, code }, 'New-order email failed')
        const delay = this.#retryDelaysMs[attempt - 1]
        if (delay === undefined) break
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
    logger.error(
      { orderNumber: order.orderNumber, attempts },
      'Gave up on the new-order email; the order is in the dashboard'
    )
  }

  /*
   * The owner and the shop's contact address, each once.
   */
  #recipients(order: Order) {
    const byLowercase = new Map<string, string>()
    for (const address of [order.shop?.owner?.email, order.shop?.email]) {
      if (address && !byLowercase.has(address.toLowerCase())) {
        byLowercase.set(address.toLowerCase(), address)
      }
    }
    return [...byLowercase.values()]
  }
}
