import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'
import type Order from '#models/order'
// The storefront's money format, so the email reads as the pages do.
import { formatNPR } from '#shared/format/money'

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/*
 * Tells a shop that a new order arrived (FR-NOT-002, the shop part). It
 * names the order, not the customer: the customer's name, phone and
 * address stay in the dashboard, one click away, so they don't sit in a
 * mailbox or pass through the mail provider (docs/07 §5).
 *
 * Expects `items` and `shop` preloaded.
 */
export default class NewOrderAlert extends BaseMail {
  constructor(
    private order: Order,
    private recipients: string[]
  ) {
    super()
  }

  get orderNumber() {
    return this.order.orderNumber
  }

  prepare() {
    const order = this.order
    const shop = order.shop
    const total = formatNPR(order.grandTotalMinor)
    const link = new URL(`/shops/${shop.slug}/orders/${order.orderNumber}`, env.get('APP_URL'))
    const items = order.items.map((item) => {
      const options = item.productVariantSnapshot ? ` (${item.productVariantSnapshot})` : ''
      return `${item.productNameSnapshot} × ${item.quantity}${options}: ${formatNPR(item.subTotalMinor)}`
    })
    const who = order.userId
      ? 'Placed from a customer account.'
      : 'Guest order: call the customer to confirm it.'
    const summary = [
      `Delivery: ${formatNPR(order.shippingTotalMinor)}`,
      `Total: ${total} (cash on delivery)`,
    ]

    for (const address of this.recipients) this.message.to(address)
    this.message.subject(`New order ${order.orderNumber} · ${total} · ${shop.name}`)
    this.message.text(
      [
        `New order ${order.orderNumber} for ${shop.name}.`,
        '',
        ...items,
        ...summary,
        '',
        who,
        `Open the order: ${link}`,
      ].join('\n')
    )
    this.message.html(
      [
        `<p>New order <strong>${escapeHtml(order.orderNumber)}</strong> for ${escapeHtml(shop.name)}.</p>`,
        `<ul>${items.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`,
        `<p>${summary.map(escapeHtml).join('<br>')}</p>`,
        `<p>${escapeHtml(who)}</p>`,
        `<p><a href="${escapeHtml(link.toString())}">Open the order</a></p>`,
      ].join('\n')
    )
  }
}
