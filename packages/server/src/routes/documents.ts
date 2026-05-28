import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { trackRateLimitQuota, withRateLimits } from '../lib/rate-limit-headers.js'
import { createRequireDeviceAuth, requireNamespaceExists } from '../middleware/auth-device.js'
import {
  getDocumentHeadEnvelope,
  getDocumentHeadMeta,
  pushDocument,
  type PushDocumentInput,
} from '../services/document-service.js'
import { toDocumentHeadMeta } from '../types/document.js'
import type { AppContext } from '../types/context.js'
import { AppError } from '../errors/app-error.js'

const pushDocumentBodySchema = z.object({
  expectedRevision: z.string().nullable().optional(),
  envelope: z.unknown(),
})

export async function registerDocumentRoutes(app: FastifyInstance, ctx: AppContext) {
  const requireDeviceAuth = createRequireDeviceAuth(ctx)

  app.get(
    '/namespaces/:namespaceId/documents/primary/head/meta',
    { preHandler: requireDeviceAuth },
    async (request) => {
      const { namespaceId } = request.params as { namespaceId: string }
      const namespace = await requireNamespaceExists(ctx, namespaceId)
      const head = await getDocumentHeadMeta(ctx.db, namespace.id)

      if (!head) {
        throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document head not found')
      }

      return withRateLimits(request, toDocumentHeadMeta(head))
    },
  )

  app.get(
    '/namespaces/:namespaceId/documents/primary/head',
    { preHandler: requireDeviceAuth },
    async (request) => {
      const { namespaceId } = request.params as { namespaceId: string }
      const namespace = await requireNamespaceExists(ctx, namespaceId)
      const head = await getDocumentHeadMeta(ctx.db, namespace.id)

      if (!head) {
        throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document head not found')
      }

      const envelope = await getDocumentHeadEnvelope(ctx.config.blob.filesystem.path, head)
      return withRateLimits(request, envelope)
    },
  )

  app.put(
    '/namespaces/:namespaceId/documents/primary',
    { preHandler: requireDeviceAuth },
    async (request, reply) => {
      const { namespaceId } = request.params as { namespaceId: string }
      const parsed = pushDocumentBodySchema.parse(request.body)
      if (parsed.envelope === undefined) {
        throw new AppError(400, 'ENVELOPE_INVALID', 'Envelope is required')
      }
      const body: PushDocumentInput = {
        expectedRevision: parsed.expectedRevision,
        envelope: parsed.envelope,
      }
      const namespace = await requireNamespaceExists(ctx, namespaceId)

      const result = await pushDocument(
        ctx.db,
        ctx.config,
        namespace,
        request.deviceAuth!,
        body,
      )

      trackRateLimitQuota(request, result.rateLimit)

      ctx.notificationHub?.broadcast(namespaceId, {
        type: 'head_changed',
        documentId: 'primary',
        revision: result.revision,
        contentSha256: result.contentSha256,
        writtenAt: result.writtenAt,
        writerDeviceId: result.writerDeviceId,
      })

      const { rateLimit: _rateLimit, ...payload } = result
      return reply.code(201).send(withRateLimits(request, payload))
    },
  )
}
