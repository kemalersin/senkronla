import type { FastifyRequest } from 'fastify'
import type { AppContext } from '../types/context.js'
import { validateAppContext } from '../services/app-registry-service.js'

export function shouldSkipAppAuth(path: string): boolean {
  if (path === '/health') {
    return true
  }

  if (path.startsWith('/docs')) {
    return true
  }

  if (path === '/metrics' || path.startsWith('/metrics/')) {
    return true
  }

  if (path.startsWith('/v1/admin')) {
    return true
  }

  if (path.startsWith('/v1/developer')) {
    return true
  }

  if (path.endsWith('/notifications')) {
    return true
  }

  if (!path.startsWith('/v1')) {
    return true
  }

  return false
}

export async function enforceAppContext(
  ctx: AppContext,
  request: FastifyRequest,
  options?: { allowOriginOnly?: boolean },
): Promise<void> {
  if (!ctx.config.apps.enabled || !ctx.config.apps.requireRegistration) {
    return
  }

  const path = request.url.split('?')[0] ?? request.url
  if (shouldSkipAppAuth(path)) {
    return
  }

  request.appAuth = await validateAppContext(ctx.db, ctx.config, request.headers, options)
}
