import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RateLimitAction, RateLimitQuota } from '../services/rate-limit-service.js'

const ACTION_HEADER_SUFFIX: Partial<Record<RateLimitAction, string>> = {
  global_ip: '',
  put_document: 'PutDocument',
  recover: 'Recover',
  pair_device: 'Pair',
  pairing_token: 'PairingToken',
}

export function rateLimitHeaderPrefix(action: RateLimitAction): string {
  const suffix = ACTION_HEADER_SUFFIX[action]
  return suffix ? `RateLimit-${suffix}` : 'RateLimit'
}

export function applyRateLimitHeaders(reply: FastifyReply, quota: RateLimitQuota): void {
  const prefix = rateLimitHeaderPrefix(quota.action)
  reply.header(`${prefix}-Limit`, String(quota.limit))
  reply.header(`${prefix}-Remaining`, String(Math.max(0, quota.remaining)))
  reply.header(`${prefix}-Reset`, String(quota.resetAfterSeconds))
}

declare module 'fastify' {
  interface FastifyRequest {
    rateLimitQuotas?: RateLimitQuota[]
  }
}

export function trackRateLimitQuota(
  request: FastifyRequest,
  quota: RateLimitQuota | null | undefined,
): void {
  if (!quota) {
    return
  }

  request.rateLimitQuotas ??= []
  request.rateLimitQuotas.push(quota)
}

export function sendRateLimitHeaders(request: FastifyRequest, reply: FastifyReply): void {
  for (const quota of request.rateLimitQuotas ?? []) {
    applyRateLimitHeaders(reply, quota)
  }
}

export function rateLimitsPayload(
  quotas: RateLimitQuota[] | undefined,
): Record<string, RateLimitQuota> | undefined {
  if (!quotas?.length) {
    return undefined
  }

  return Object.fromEntries(quotas.map((quota) => [quota.action, quota]))
}

export function withRateLimits<T extends object>(
  request: FastifyRequest,
  payload: T,
): T & { rateLimits?: Record<string, RateLimitQuota> } {
  const rateLimits = rateLimitsPayload(request.rateLimitQuotas)
  if (!rateLimits) {
    return payload
  }

  return { ...payload, rateLimits }
}

export const RATE_LIMIT_EXPOSED_HEADERS = [
  'Retry-After',
  'RateLimit-Limit',
  'RateLimit-Remaining',
  'RateLimit-Reset',
  'RateLimit-PutDocument-Limit',
  'RateLimit-PutDocument-Remaining',
  'RateLimit-PutDocument-Reset',
  'RateLimit-Recover-Limit',
  'RateLimit-Recover-Remaining',
  'RateLimit-Recover-Reset',
  'RateLimit-Pair-Limit',
  'RateLimit-Pair-Remaining',
  'RateLimit-Pair-Reset',
  'RateLimit-PairingToken-Limit',
  'RateLimit-PairingToken-Remaining',
  'RateLimit-PairingToken-Reset',
] as const
