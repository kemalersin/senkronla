import type { FastifyRequest } from 'fastify'
import { AppError } from '../errors/app-error.js'
import { hashDeviceToken } from '../lib/crypto.js'
import { findDeviceByTokenHash } from '../services/device-service.js'
import { findNamespaceByPublicId } from '../services/namespace-service.js'
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

export function createRequireDeviceAuth(ctx: AppContext) {
  return async function requireDeviceAuth(request: FastifyRequest) {
    const params = request.params as { namespaceId?: string }
    const namespaceId = params.namespaceId

    if (!namespaceId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'namespaceId path parameter is required')
    }

    const token = extractBearerToken(request)
    const tokenHash = hashDeviceToken(token)
    const device = await findDeviceByTokenHash(ctx.db, namespaceId, tokenHash)

    if (!device || !device.device_id) {
      throw new AppError(401, 'DEVICE_TOKEN_INVALID', 'Device token is invalid or revoked')
    }

    request.deviceAuth = {
      deviceUuid: device.id,
      deviceId: device.device_id,
      namespaceUuid: device.namespace_uuid,
      namespaceId: device.namespace_id,
      clientDeviceId: device.client_device_id,
      label: device.label,
      isHost: device.is_host,
    }
  }
}

export async function requireNamespaceExists(ctx: AppContext, namespaceId: string) {
  const namespace = await findNamespaceByPublicId(ctx.db, namespaceId)
  if (!namespace) {
    throw new AppError(404, 'NAMESPACE_NOT_FOUND', 'Namespace not found')
  }

  return namespace
}
