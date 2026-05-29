import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { trackRateLimitQuota, withRateLimits } from '../lib/rate-limit-headers.js'
import { createRequireDeviceAuth, requireNamespaceExists } from '../middleware/auth-device.js'
import {
  assertValidDocumentIdParam,
  getDocumentHeadEnvelope,
  getDocumentHeadMeta,
  listDocumentHeads,
  pushDocument,
  type PushDocumentInput,
} from '../services/document-service.js'
import { toDocumentHeadListItem, toDocumentHeadMeta } from '../types/document.js'
import type { AppContext } from '../types/context.js'
import { AppError } from '../errors/app-error.js'
import type { NamespaceRow } from '../types/db.js'

const pushDocumentBodySchema = z.object({
  expectedRevision: z.string().nullable().optional(),
  envelope: z.unknown(),
})

async function handleGetHeadMeta(
  ctx: AppContext,
  namespace: NamespaceRow,
  documentId: string,
  request: FastifyRequest,
) {
  const head = await getDocumentHeadMeta(ctx.db, namespace.id, documentId)

  if (!head) {
    throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document head not found')
  }

  return withRateLimits(request, toDocumentHeadMeta(head))
}

async function handleGetHead(
  ctx: AppContext,
  namespace: NamespaceRow,
  documentId: string,
  request: FastifyRequest,
) {
  const head = await getDocumentHeadMeta(ctx.db, namespace.id, documentId)

  if (!head) {
    throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document head not found')
  }

  const envelope = await getDocumentHeadEnvelope(ctx.config.blob.filesystem.path, head)
  return withRateLimits(request, envelope)
}

async function handlePush(
  ctx: AppContext,
  namespace: NamespaceRow,
  namespacePublicId: string,
  documentId: string,
  request: FastifyRequest,
) {
  const parsed = pushDocumentBodySchema.parse(request.body)
  if (parsed.envelope === undefined) {
    throw new AppError(400, 'ENVELOPE_INVALID', 'Envelope is required')
  }

  const body: PushDocumentInput = {
    expectedRevision: parsed.expectedRevision,
    envelope: parsed.envelope,
  }

  const result = await pushDocument(
    ctx.db,
    ctx.config,
    namespace,
    request.deviceAuth!,
    documentId,
    body,
  )

  trackRateLimitQuota(request, result.rateLimit)

  ctx.notificationHub?.broadcast(namespacePublicId, {
    type: 'head_changed',
    documentId,
    revision: result.revision,
    contentSha256: result.contentSha256,
    writtenAt: result.writtenAt,
    writerDeviceId: result.writerDeviceId,
  })

  const { rateLimit: _rateLimit, ...payload } = result
  return payload
}

function registerDocumentIdRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  requireDeviceAuth: ReturnType<typeof createRequireDeviceAuth>,
  basePath: string,
  fixedDocumentId?: string,
) {
  const resolveDocumentId = (params: { documentId?: string }) => {
    const documentId = fixedDocumentId ?? params.documentId
    if (!documentId) {
      throw new AppError(400, 'INVALID_DOCUMENT_ID', 'documentId is required')
    }
    assertValidDocumentIdParam(documentId)
    return documentId
  }

  app.get(
    `${basePath}/head/meta`,
    { preHandler: requireDeviceAuth },
    async (request) => {
      const { namespaceId, documentId: pathDocumentId } = request.params as {
        namespaceId: string
        documentId?: string
      }
      const documentId = resolveDocumentId({ documentId: pathDocumentId })
      const namespace = await requireNamespaceExists(ctx, namespaceId, request)
      return handleGetHeadMeta(ctx, namespace, documentId, request)
    },
  )

  app.get(
    `${basePath}/head`,
    { preHandler: requireDeviceAuth },
    async (request) => {
      const { namespaceId, documentId: pathDocumentId } = request.params as {
        namespaceId: string
        documentId?: string
      }
      const documentId = resolveDocumentId({ documentId: pathDocumentId })
      const namespace = await requireNamespaceExists(ctx, namespaceId, request)
      return handleGetHead(ctx, namespace, documentId, request)
    },
  )

  app.put(
    basePath,
    { preHandler: requireDeviceAuth },
    async (request, reply) => {
      const { namespaceId, documentId: pathDocumentId } = request.params as {
        namespaceId: string
        documentId?: string
      }
      const documentId = resolveDocumentId({ documentId: pathDocumentId })
      const namespace = await requireNamespaceExists(ctx, namespaceId, request)
      const payload = await handlePush(ctx, namespace, namespaceId, documentId, request)
      return reply.code(201).send(withRateLimits(request, payload))
    },
  )
}

export async function registerDocumentRoutes(app: FastifyInstance, ctx: AppContext) {
  const requireDeviceAuth = createRequireDeviceAuth(ctx)

  app.get(
    '/namespaces/:namespaceId/documents',
    { preHandler: requireDeviceAuth },
    async (request) => {
      const { namespaceId } = request.params as { namespaceId: string }
      const namespace = await requireNamespaceExists(ctx, namespaceId, request)
      const documents = await listDocumentHeads(ctx.db, namespace.id)
      return withRateLimits(request, { documents })
    },
  )

  registerDocumentIdRoutes(
    app,
    ctx,
    requireDeviceAuth,
    '/namespaces/:namespaceId/documents/:documentId',
  )
}
