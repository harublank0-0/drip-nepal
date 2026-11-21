import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { auditIpHash } from '#modules/audit/actions/record_audit'
import type { Actor } from '#modules/platform/actor'
import {
  IDEMPOTENCY_KEY_PATTERN,
  requestFingerprint,
  type IdempotencyScope,
  type IdempotentResponse,
} from '#modules/platform/idempotency'
import { mfaWithin } from '#middleware/platform_staff_middleware'
import { STEP_UP_WINDOW_MS } from '#modules/identity/staff'

/*
 * HTTP helpers the controllers share (docs/09 §3.4): the actor an action
 * records, the idempotency scope of a ⚷ operation (docs/06 §7), the version
 * an ⟳ operation expects (docs/06 §8), and the step-up check (docs/07
 * §3.10). Controllers stay thin: they validate, call one action, render.
 */

export function sellerActor(ctx: HttpContext): Actor {
  return {
    type: 'shop_member',
    userId: ctx.auth.getUserOrFail().id,
    role: `shop:${ctx.shop.id}:${ctx.shop.actor}`,
    requestId: ctx.request.id() ?? null,
    ipHash: auditIpHash(ctx.request.ip()),
  }
}

export function staffActor(ctx: HttpContext): Actor {
  return {
    type: 'platform_staff',
    userId: ctx.staff.userId,
    role: `platform:${ctx.staff.role}`,
    requestId: ctx.request.id() ?? null,
    ipHash: auditIpHash(ctx.request.ip()),
  }
}

// ⚷: the key of the request, required (400 `IDEMPOTENCY_KEY_REQUIRED`), with its fingerprint.
export function idempotencyScope(
  ctx: HttpContext,
  operation: string,
  body: unknown
): IdempotencyScope {
  const key = ctx.request.header('idempotency-key')
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) throw new DomainError('IDEMPOTENCY_KEY_REQUIRED')
  return {
    actorScope: ctx.auth.getUserOrFail().id,
    operation,
    key,
    fingerprint: requestFingerprint({
      method: ctx.request.method(),
      route: ctx.route?.pattern ?? ctx.request.url(),
      params: ctx.params as Record<string, string>,
      body,
      ifMatch: ctx.request.header('if-match') ?? null,
    }),
  }
}

/*
 * ⟳: the version of `If-Match: "<version>"`. Missing, `*` or a list answers
 * 428; a weak or malformed tag can match no version, so the action answers
 * 412 with the current resource.
 */
export function expectedVersion(ctx: HttpContext): number {
  const header = ctx.request.header('if-match')?.trim()
  if (!header || header === '*' || header.includes(','))
    throw new DomainError('PRECONDITION_REQUIRED')
  const match = /^"(\d{1,10})"$/.exec(header)
  return match ? Number(match[1]) : -1
}

export function setEtag(ctx: HttpContext, version: number) {
  ctx.response.header('ETag', `"${version}"`)
}

export function assertStepUp(ctx: HttpContext) {
  if (!mfaWithin(ctx, STEP_UP_WINDOW_MS)) {
    throw new DomainError('MFA_REQUIRED', { extensions: { mfa: 'verification_required' } })
  }
}

export function sendIdempotent<T>(ctx: HttpContext, result: IdempotentResponse<T>) {
  if (result.replayed) ctx.response.header('Idempotency-Replayed', 'true')
  return ctx.response.status(result.status).send(result.body)
}
