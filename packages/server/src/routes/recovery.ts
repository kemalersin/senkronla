import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { trackRateLimitQuota, withRateLimits } from '../lib/rate-limit-headers.js'
import { AppError } from '../errors/app-error.js'
import { findNamespaceByPublicId } from '../services/namespace-service.js'
import { recoverNamespace } from '../services/recovery-service.js'
import type { AppContext } from '../types/context.js'

const recoveryProofSchema = z.object({
  salt: z.string().min(1),
  hash: z.string().min(1),
})

const recoverNamespaceBodySchema = z.object({
  recoveryKeyProof: recoveryProofSchema,
  deviceLabel: z.string().min(1).max(256),
  clientDeviceId: z.string().uuid(),
})

export async function registerRecoveryRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/namespaces/:namespaceId/recover', async (request, reply) => {
    const { namespaceId } = request.params as { namespaceId: string }
    const body = recoverNamespaceBodySchema.parse(request.body)

    const namespace = await findNamespaceByPublicId(ctx.db, namespaceId)
    if (!namespace) {
      throw new AppError(404, 'NAMESPACE_NOT_FOUND', 'Namespace not found')
    }

    const result = await recoverNamespace(ctx.db, ctx.config, namespace, body)
    trackRateLimitQuota(request, result.rateLimit)

    const { rateLimit: _rateLimit, ...payload } = result
    return reply.send(withRateLimits(request, payload))
  })
}
