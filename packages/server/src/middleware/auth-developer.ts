import type { FastifyRequest } from 'fastify'
import { AppError } from '../errors/app-error.js'
import { isDeveloperPortalEnabled } from '../lib/developer-portal.js'
import { resolveDeveloperSession } from '../services/developer-auth-service.js'
import type { AppContext } from '../types/context.js'

function extractBearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authorization header is required')
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authorization header is required')
  }

  return token
}

export function createRequireDeveloperPortal(ctx: AppContext) {
  return async function requireDeveloperPortal() {
    if (!isDeveloperPortalEnabled(ctx.config)) {
      throw new AppError(503, 'DEVELOPER_PORTAL_DISABLED', 'Developer portal is not enabled')
    }
  }
}

export function createRequireDeveloperAuth(ctx: AppContext) {
  const requireDeveloperPortal = createRequireDeveloperPortal(ctx)

  return async function requireDeveloperAuth(request: FastifyRequest) {
    await requireDeveloperPortal()

    const token = extractBearerToken(request)
    const developer = await resolveDeveloperSession(ctx.db, ctx.config, token)

    request.developerAuth = {
      developerUuid: developer.id,
      email: developer.email,
    }
  }
}
