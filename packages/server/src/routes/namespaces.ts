import { isValidNamespaceId } from '@senkronla/protocol'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError } from '../errors/app-error.js'
import { trackRateLimitQuota, withRateLimits } from '../lib/rate-limit-headers.js'
import { createRequireDeviceAuth, requireNamespaceExists } from '../middleware/auth-device.js'
import {
  createNamespace,
  getNamespaceInfo,
} from '../services/namespace-service.js'
import type { AppContext } from '../types/context.js'

const recoveryProofSchema = z.object({
  salt: z.string().min(1),
  hash: z.string().min(1),
})

const createNamespaceBodySchema = z
  .object({
    namespaceId: z.string().uuid(),
    namespaceLabel: z.string().min(1).max(256),
    deviceLabel: z.string().min(1).max(256),
    clientDeviceId: z.string().uuid(),
    recoveryKeyProof: recoveryProofSchema.optional(),
    recoveryKeySalt: z.string().min(1).optional(),
    recoveryKeyHash: z.string().min(1).optional(),
  })
  .superRefine((body, ctx) => {
    const hasProof = Boolean(body.recoveryKeyProof)
    const hasFlat = Boolean(body.recoveryKeySalt && body.recoveryKeyHash)

    if (!hasProof && !hasFlat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'recoveryKeyProof or recoveryKeySalt/recoveryKeyHash is required',
        path: ['recoveryKeyProof'],
      })
    }
  })

function resolveRecovery(body: z.infer<typeof createNamespaceBodySchema>) {
  if (body.recoveryKeyProof) {
    return {
      recoverySalt: body.recoveryKeyProof.salt,
      recoveryHash: body.recoveryKeyProof.hash,
    }
  }

  return {
    recoverySalt: body.recoveryKeySalt!,
    recoveryHash: body.recoveryKeyHash!,
  }
}

export async function registerNamespaceRoutes(app: FastifyInstance, ctx: AppContext) {
  const requireDeviceAuth = createRequireDeviceAuth(ctx)

  app.post('/namespaces', async (request, reply) => {
    const body = createNamespaceBodySchema.parse(request.body)

    if (!isValidNamespaceId(body.namespaceId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'namespaceId must be a UUID v4')
    }

    const recovery = resolveRecovery(body)
    const result = await createNamespace(ctx.db, ctx.config, {
      namespaceId: body.namespaceId,
      namespaceLabel: body.namespaceLabel,
      recoverySalt: recovery.recoverySalt,
      recoveryHash: recovery.recoveryHash,
      deviceLabel: body.deviceLabel,
      clientDeviceId: body.clientDeviceId,
      appUuid: request.appAuth?.appUuid ?? null,
      appId: request.appAuth?.appId ?? null,
      clientIp: request.ip,
    })
    trackRateLimitQuota(request, result.rateLimit)

    const { rateLimit: _rateLimit, ...payload } = result
    return reply.code(201).send(withRateLimits(request, payload))
  })

  app.get('/namespaces/:namespaceId', { preHandler: requireDeviceAuth }, async (request) => {
    const { namespaceId } = request.params as { namespaceId: string }
    const namespace = await requireNamespaceExists(ctx, namespaceId, request)

    if (request.deviceAuth?.namespaceId !== namespaceId) {
      throw new AppError(403, 'FORBIDDEN', 'Device token does not match namespace')
    }

    return getNamespaceInfo(ctx.db, ctx.config, namespace)
  })
}
