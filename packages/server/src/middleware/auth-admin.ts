import type { FastifyRequest } from 'fastify'
import { AppError } from '../errors/app-error.js'
import { secureCompareTokens } from '../services/unlock-service.js'
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

export function matchesAdminBearer(
  request: FastifyRequest,
  configuredToken: string | undefined,
): boolean {
  if (!configuredToken) {
    return false
  }

  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return false
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    return false
  }

  return secureCompareTokens(token, configuredToken)
}

export function createRequireAdminAuth(ctx: AppContext) {
  return async function requireAdminAuth(request: FastifyRequest) {
    const configuredToken = ctx.config.auth.adminApiToken
    if (!configuredToken) {
      throw new AppError(503, 'ADMIN_API_DISABLED', 'Admin API is not configured')
    }

    const token = extractBearerToken(request)
    if (!secureCompareTokens(token, configuredToken)) {
      throw new AppError(401, 'UNAUTHORIZED', 'Admin token is invalid')
    }
  }
}
