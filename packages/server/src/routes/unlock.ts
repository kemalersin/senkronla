import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createRequireDeviceAuth, requireNamespaceExists } from '../middleware/auth-device.js'
import { AppError } from '../errors/app-error.js'
import { redeemUnlockCode } from '../services/unlock-service.js'
import { getLimitsForNamespace } from '../services/slot-service.js'
import type { AppContext } from '../types/context.js'

const redeemUnlockBodySchema = z.object({
  unlockCode: z.string().min(1),
})

export async function registerUnlockRoutes(app: FastifyInstance, ctx: AppContext) {
  const requireDeviceAuth = createRequireDeviceAuth(ctx)

  app.post(
    '/namespaces/:namespaceId/unlock',
    { preHandler: requireDeviceAuth },
    async (request) => {
      const { namespaceId } = request.params as { namespaceId: string }
      const body = redeemUnlockBodySchema.parse(request.body)
      const namespace = await requireNamespaceExists(ctx, namespaceId)

      if (request.deviceAuth?.namespaceId !== namespaceId) {
        throw new AppError(403, 'FORBIDDEN', 'Device token does not match namespace')
      }

      const result = await redeemUnlockCode(ctx.db, ctx.config, namespace, body.unlockCode)

      const limits = await getLimitsForNamespace(
        ctx.db,
        namespace.id,
        namespace.free_device_limit,
        result.purchasedSlots,
      )

      ctx.notificationHub?.broadcast(namespaceId, {
        type: 'limits_changed',
        maxDevices: limits.maxDevices,
        activeDevices: limits.activeDevices,
        purchasedSlots: limits.purchasedSlots,
      })

      return result
    },
  )
}
