import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { APP_ID_PATTERN, APP_ID_VALIDATION_MESSAGE } from '../lib/app-id.js'
import { trackRateLimitQuota, withRateLimits } from '../lib/rate-limit-headers.js'
import { createRequireDeviceAuth, requireNamespaceExists } from '../middleware/auth-device.js'
import {
  listDevices,
  pairDeviceWithCode,
  revokeDevice,
} from '../services/device-service.js'
import { createPairingToken } from '../services/pairing-service.js'
import { buildLimitsResponse, getLimitsForNamespace } from '../services/slot-service.js'
import type { AppContext } from '../types/context.js'

const pairingTokenBodySchema = z.object({
  ttlSeconds: z.coerce.number().int().positive().optional(),
  allowedAppIds: z
    .array(z.string().regex(APP_ID_PATTERN, APP_ID_VALIDATION_MESSAGE))
    .max(10)
    .optional(),
})

const pairDeviceBodySchema = z.object({
  pairingCode: z.string().regex(/^\d{6}$/),
  deviceLabel: z.string().min(1).max(256),
  clientDeviceId: z.string().uuid(),
})

export async function registerDeviceRoutes(app: FastifyInstance, ctx: AppContext) {
  const requireDeviceAuth = createRequireDeviceAuth(ctx)

  app.get('/namespaces/:namespaceId/devices', { preHandler: requireDeviceAuth }, async (request) => {
    const { namespaceId } = request.params as { namespaceId: string }
    const namespace = await requireNamespaceExists(ctx, namespaceId, request)

    return listDevices(ctx.db, ctx.config, namespace, request.deviceAuth!.deviceUuid)
  })

  app.post('/namespaces/:namespaceId/pairing-tokens', { preHandler: requireDeviceAuth }, async (request, reply) => {
    const { namespaceId } = request.params as { namespaceId: string }
    const body = pairingTokenBodySchema.parse(request.body ?? {})
    const namespace = await requireNamespaceExists(ctx, namespaceId, request)
    const hostLabel = request.deviceAuth!.label

    const result = await createPairingToken(ctx.db, ctx.config, namespace, hostLabel, body)
    trackRateLimitQuota(request, result.rateLimit)

    const { rateLimit: _rateLimit, ...payload } = result
    return reply.code(201).send(withRateLimits(request, payload))
  })

  app.post('/namespaces/:namespaceId/devices', async (request, reply) => {
    const { namespaceId } = request.params as { namespaceId: string }
    const body = pairDeviceBodySchema.parse(request.body)
    const namespace = await requireNamespaceExists(ctx, namespaceId, request)

    const result = await pairDeviceWithCode(ctx.db, ctx.config, namespace, body, request.appAuth)
    trackRateLimitQuota(request, result.rateLimit)

    const { rateLimit: _rateLimit, ...payload } = result
    return reply.code(201).send(withRateLimits(request, payload))
  })

  app.delete(
    '/namespaces/:namespaceId/devices/:deviceId',
    { preHandler: requireDeviceAuth },
    async (request, reply) => {
      const { namespaceId, deviceId } = request.params as { namespaceId: string; deviceId: string }
      const namespace = await requireNamespaceExists(ctx, namespaceId, request)

      await revokeDevice(ctx.db, namespace, deviceId)

      return reply.code(204).send()
    },
  )

  app.get('/namespaces/:namespaceId/limits', { preHandler: requireDeviceAuth }, async (request) => {
    const { namespaceId } = request.params as { namespaceId: string }
    const namespace = await requireNamespaceExists(ctx, namespaceId, request)
    const limits = await getLimitsForNamespace(
      ctx.db,
      namespace.id,
      namespace.free_device_limit,
      namespace.purchased_slots,
    )

    return buildLimitsResponse(ctx.config, limits)
  })
}
