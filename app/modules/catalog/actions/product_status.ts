import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  DomainError,
  InvalidStateTransition,
  type ProblemErrorItem,
} from '#exceptions/domain_error'
import { InvariantViolation } from '#exceptions/programming_errors'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { checkProductFields } from '#modules/catalog/actions/product_draft'
import { missingForSubmit } from '#modules/catalog/domain/submit_readiness'
import { PRODUCT_MOVES } from '#shared/ui/product_status'
import {
  productEditorData,
  shopProduct,
  type ProductEditorData,
  type ProductRow,
} from '#modules/catalog/queries'
import { shippingConfigured } from '#modules/logistics/queries'
import type { Actor } from '#modules/platform/actor'
import { sendJob } from '#modules/platform/jobs'
import { withTx } from '#modules/platform/tx'
import { holdsAcceptedAgreement } from '#modules/shops/queries'

/*
 * The product status operations of docs/06 §13.5 and 05 §6.10 (01
 * FR-CAT-005, FR-CAT-007; R1-S part 2e-ii). The controller has checked the
 * permission (`shop.products.publish` to publish and unpublish,
 * `shop.products.edit` to archive and restore) and the status gate (an
 * `active` shop). Each runs in one transaction:
 *
 * 1. the product is locked inside the shop (another shop's product is 404,
 *    T-SEC-001), and its status must allow the operation, else 409
 *    `INVALID_STATE_TRANSITION` with the operations it does allow;
 * 2. the compare-and-set on `status` and `version` moves it and bumps the
 *    version, so an editor holding the old ETag gets 412;
 * 3. one audit row (`product.publish`, `product.unpublish`,
 *    `product.archive`, `product.restore`, proposed) records the status from
 *    and to, and `catalog.refresh_listing` is sent.
 *
 * `publishProduct` moves `draft` (in a `post` review-mode shop, for a brand
 * without `requires_moderation`; otherwise the product goes through review,
 * which R1-S does not build) or `unpublished` to `published`, after the
 * publication gate of AC-FR-CAT-005-2 lists every missing item in one 422:
 * an agreement for a version the platform still accepts (AC-FR-SHOP-013-3),
 * a `ready` image, an active variant with every active variant priced above
 * zero, the disclosures, the category's required attributes and axes, and
 * shipping. A draft is also checked as a new product is: an active leaf
 * category and a selectable brand. An unpublished product was live and keeps
 * its category and brand, as `updateProduct` does (a platform change does not
 * lock a vendor out). `published_at` is now, and
 * `first_published_at` keeps the first time. `archiveProduct` also archives
 * every active variant, which frees their SKUs; their stock rows stay
 * (04a §7.6). `restoreProduct` returns an archived product to `draft` and
 * leaves its variants archived.
 *
 * The answer is the editor view with the new version.
 */
export type ProductStatusCommand = { shopId: string; productId: string }

type Context<T> = {
  actor: Actor
  present: (data: ProductEditorData, client: QueryClientContract) => Promise<T>
}

type StatusChange = {
  from: readonly string[]
  to: string
  action: 'product.publish' | 'product.unpublish' | 'product.archive' | 'product.restore'
  check?: (
    trx: TransactionClientContract,
    product: ProductRow,
    editor: ProductEditorData
  ) => Promise<void>
  extra?: (product: ProductRow, trx: TransactionClientContract) => Record<string, unknown>
  after?: (trx: TransactionClientContract, product: ProductRow) => Promise<void>
}

/*
 * The operations of these four a product in each status allows, for the
 * 409's `allowed_events`: the list the seller pages offer as buttons
 * (`PRODUCT_MOVES`, R1-S part 2f-iii). `pending_review`, `rejected` and
 * `blocked` leave by review, an edit or staff (05 §6.10), so their 409 lists
 * none. A draft is told `publish`, which a `pre` shop or a watch-listed
 * brand then answers with `[submit]`; archiving needs a product that was
 * live (AC-FR-CAT-007-2).
 */
const ALLOWED = PRODUCT_MOVES

// The publication gate (AC-FR-CAT-005-2): every missing item, in one 422.
async function publishGate(
  trx: TransactionClientContract,
  product: ProductRow,
  editor: ProductEditorData
) {
  const problems: ProblemErrorItem[] = []
  if (!(await holdsAcceptedAgreement(product.shopId, { client: trx }))) {
    problems.push({
      field: 'agreement',
      code: 'required',
      message: 'Accept the current seller agreement first.',
    })
  }
  const readiness = { ...product }
  for (const field of missingForSubmit(readiness, editor.variants, editor.readyMediaCount)) {
    problems.push({ field, code: 'required', message: 'Fill this in before you publish.' })
  }
  const keptRows: { attribute_value_id: string }[] = await trx
    .from('product_attribute_values')
    .where('product_id', product.id)
    .select('attribute_value_id')
  const checked = await checkProductFields(
    trx,
    {
      categoryId: product.categoryId,
      brandId: product.brandId,
      attributes: editor.attributes,
      isImported: product.isImported,
      countryOfOrigin: product.countryOfOrigin,
    },
    {
      category: product.status === 'draft' ? 'active_leaf' : 'stored',
      brand: product.status === 'draft',
      attributes: true,
      origin: true,
      complete: true,
      keptValueIds: new Set(keptRows.map((row) => row.attribute_value_id)),
    }
  )
  /*
   * The request sent no attributes, so an indexed field (`attributes.N.…`)
   * means nothing to the client: it is given on `attributes`, its message
   * naming the stored attribute.
   */
  for (const problem of checked.problems) {
    const indexed = /^attributes\.(\d+)\./.exec(problem.field)
    if (!indexed) {
      problems.push(problem)
      continue
    }
    const code = editor.attributes[Number(indexed[1])]?.code
    const message = code ? `${code}: ${problem.message}` : problem.message
    problems.push({ ...problem, field: 'attributes', message })
  }
  const missingAxes = [...checked.rules.values()]
    .filter((rule) => rule.usage === 'variant_axis' && rule.isRequired)
    .filter((rule) => !editor.optionAxes.includes(rule.code))
  if (missingAxes.length > 0) {
    problems.push({
      field: 'option_axes',
      code: 'required',
      message: `Products in this category vary by ${missingAxes.map((rule) => rule.name).join(' and ')}.`,
    })
  }
  if (!(await shippingConfigured(product.shopId, { client: trx }))) {
    problems.push({
      field: 'shipping',
      code: 'required',
      message: 'Set up where you deliver and your delivery rates first.',
    })
  }
  if (problems.length > 0) throw new DomainError('VALIDATION_FAILED', { errors: problems })
}

// A `draft` goes live directly only in a `post` review-mode shop, and not for a watch-listed brand.
async function publishFromDraftAllowed(trx: TransactionClientContract, product: ProductRow) {
  const shop = await trx
    .from('shops')
    .where('id', product.shopId)
    .select('product_review_mode')
    .firstOrFail()
  if (shop.product_review_mode !== 'post') return false
  if (!product.brandId) return true
  const brand = await trx
    .from('brands')
    .where('id', product.brandId)
    .select('requires_moderation')
    .first()
  return brand?.requires_moderation !== true
}

async function changeStatus<T>(
  command: ProductStatusCommand,
  change: StatusChange,
  context: Context<T>
): Promise<{ body: T; version: number }> {
  return withTx(async (trx) => {
    const product = await shopProduct(trx, command.shopId, command.productId, { lock: true })
    if (!product) throw new DomainError('NOT_FOUND')
    if (!change.from.includes(product.status)) {
      throw new InvalidStateTransition(product.status, [...(ALLOWED[product.status] ?? [])])
    }
    const editor = await productEditorData(trx, product)
    if (change.check) await change.check(trx, product, editor)

    const [updated] = await trx
      .from('products')
      .where({ id: product.id, version: product.version, status: product.status })
      .update({
        status: change.to,
        version: trx.raw('version + 1'),
        ...(change.extra ? change.extra(product, trx) : {}),
      })
      .returning('version')
    // The row is locked above, so the compare-and-set cannot miss it.
    if (!updated) throw new InvariantViolation(`${change.action}: the locked product changed`)
    if (change.after) await change.after(trx, product)
    await recordAudit(trx, {
      actorType: context.actor.type,
      actorUserId: context.actor.userId,
      actorRole: context.actor.role,
      requestId: context.actor.requestId,
      ipHash: context.actor.ipHash ?? null,
      action: change.action,
      subjectType: 'product',
      subjectId: product.id,
      shopId: product.shopId,
      changes: { status: { from: product.status, to: change.to } },
    })
    await sendJob(trx, 'catalog.refresh_listing', {
      product_id: product.id,
      request_id: context.actor.requestId,
      causation_id: null,
    })
    const fresh = await shopProduct(trx, command.shopId, product.id)
    return {
      body: await context.present(await productEditorData(trx, fresh!), trx),
      version: updated.version as number,
    }
  })
}

export function publishProduct<T>(command: ProductStatusCommand, context: Context<T>) {
  return changeStatus(
    command,
    {
      from: ['draft', 'unpublished'],
      to: 'published',
      action: 'product.publish',
      check: async (trx, product, editor) => {
        if (product.status === 'draft' && !(await publishFromDraftAllowed(trx, product))) {
          // In `pre` mode, or for a watch-listed brand, a draft is submitted for review instead.
          throw new InvalidStateTransition('draft', ['submit'])
        }
        await publishGate(trx, product, editor)
      },
      extra: (_product, trx) => ({
        published_at: trx.knexRawQuery('now()'),
        first_published_at: trx.knexRawQuery('coalesce(first_published_at, now())'),
      }),
    },
    context
  )
}

export function unpublishProduct<T>(command: ProductStatusCommand, context: Context<T>) {
  return changeStatus(
    command,
    { from: ['published'], to: 'unpublished', action: 'product.unpublish' },
    context
  )
}

export function archiveProduct<T>(command: ProductStatusCommand, context: Context<T>) {
  return changeStatus(
    command,
    {
      from: ['published', 'unpublished'],
      to: 'archived',
      action: 'product.archive',
      /*
       * Every active variant is archived too, which frees its SKU; its stock
       * row stays (04a §7.6). A compare-and-set on `status` under the product
       * lock. No stock is written, so `inventory_items` (05 §4.4) is not
       * locked; a change that writes stock here must lock it first.
       */
      after: async (trx, product) => {
        await trx
          .from('product_variants')
          .where({ product_id: product.id, shop_id: product.shopId, status: 'active' })
          .update({ status: 'archived', version: trx.raw('version + 1') })
      },
    },
    context
  )
}

export function restoreProduct<T>(command: ProductStatusCommand, context: Context<T>) {
  return changeStatus(
    command,
    { from: ['archived'], to: 'draft', action: 'product.restore' },
    context
  )
}
