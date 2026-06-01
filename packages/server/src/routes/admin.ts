import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError } from '../errors/app-error.js'
import { APP_ID_PATTERN, APP_ID_VALIDATION_MESSAGE, normalizeAppId } from '../lib/app-id.js'
import { createRequireAdminAuth } from '../middleware/auth-admin.js'
import {
  getAdminOverview,
  listAdminNamespaces,
  listAdminRateLimitEvents,
  listAdminUnlockCodes,
  listAdminUnlockEvents,
} from '../services/admin-dashboard-service.js'
import { RATE_LIMIT_ACTION } from '../services/rate-limit-service.js'
import { findNamespaceByPublicId } from '../services/namespace-service.js'
import { createUnlockCode } from '../services/unlock-service.js'
import {
  getNamespaceLimits,
  patchNamespaceLimits,
} from '../services/operator-limit-service.js'
import { purgeAllRecords } from '../services/admin-purge-service.js'
import { purgeRevisions } from '../services/revision-retention-service.js'
import { getMailSettings, patchMailSettings } from '../services/mail-settings-service.js'
import {
  getOperatorLimitSettings,
  patchOperatorLimitSettings,
} from '../services/operator-limit-settings-service.js'
import { getRuntimeLimitBaselines } from '../services/limit-resolution-service.js'
import { patchLimitOverridesSchema } from '../types/limit-overrides.js'
import { mailSettingsOverrideSchema } from '../types/mail-settings.js'
import type { AppContext } from '../types/context.js'

const createUnlockCodeBodySchema = z.object({
  namespaceId: z.string().uuid(),
  slots: z.coerce.number().int().positive().max(999),
  expiresAt: z.string().datetime().nullable().optional(),
  note: z.string().max(256).nullable().optional(),
})

const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const listQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(128).optional(),
})

const namespaceListQuerySchema = listQuerySchema.extend({
  appId: z
    .string()
    .transform(normalizeAppId)
    .refine((value) => APP_ID_PATTERN.test(value), { message: APP_ID_VALIDATION_MESSAGE })
    .optional(),
})

const purgeAllRecordsBodySchema = z.object({
  confirm: z.literal('purge-all-records'),
})

const purgeRevisionsBodySchema = z
  .object({
    mode: z.enum(['date', 'count']),
    scope: z.enum(['deployment', 'namespace', 'app']),
    before: z.string().datetime().optional(),
    keepLastRevisions: z.coerce.number().int().positive().max(10_000).optional(),
    namespaceId: z.string().uuid().optional(),
    appId: z
      .string()
      .transform(normalizeAppId)
      .refine((value) => APP_ID_PATTERN.test(value), { message: APP_ID_VALIDATION_MESSAGE })
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (body.mode === 'date' && !body.before) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'before is required when mode is date',
        path: ['before'],
      })
    }

    if (body.mode === 'count' && body.keepLastRevisions === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'keepLastRevisions is required when mode is count',
        path: ['keepLastRevisions'],
      })
    }

    if (body.scope === 'namespace' && !body.namespaceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'namespaceId is required when scope is namespace',
        path: ['namespaceId'],
      })
    }

    if (body.scope === 'app' && !body.appId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'appId is required when scope is app',
        path: ['appId'],
      })
    }

    if (body.scope === 'deployment' && (body.namespaceId || body.appId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'namespaceId and appId must be omitted when scope is deployment',
        path: ['scope'],
      })
    }
  })

const rateLimitListQuerySchema = listQuerySchema.extend({
  action: z
    .enum([
      RATE_LIMIT_ACTION.recover,
      RATE_LIMIT_ACTION.pairDevice,
      RATE_LIMIT_ACTION.pairingToken,
      RATE_LIMIT_ACTION.putDocument,
      RATE_LIMIT_ACTION.namespaceCreate,
      RATE_LIMIT_ACTION.globalIp,
    ])
    .optional(),
})

export async function registerAdminRoutes(app: FastifyInstance, ctx: AppContext) {
  const requireAdminAuth = createRequireAdminAuth(ctx)
  const limitBaselines = getRuntimeLimitBaselines(ctx.config)

  app.get('/admin/overview', { preHandler: requireAdminAuth }, async () => {
    return getAdminOverview(ctx.db)
  })

  app.get('/admin/namespaces', { preHandler: requireAdminAuth }, async (request) => {
    const query = namespaceListQuerySchema.parse(request.query)
    return listAdminNamespaces(ctx.db, query, ctx.config.apps.enabled)
  })

  app.get('/admin/unlock-codes', { preHandler: requireAdminAuth }, async (request) => {
    const query = listQuerySchema.parse(request.query)
    return listAdminUnlockCodes(ctx.db, query)
  })

  app.get('/admin/unlock-events', { preHandler: requireAdminAuth }, async (request) => {
    const query = listQuerySchema.parse(request.query)
    return listAdminUnlockEvents(ctx.db, query)
  })

  app.get('/admin/rate-limit-events', { preHandler: requireAdminAuth }, async (request) => {
    const query = rateLimitListQuerySchema.parse(request.query)
    return listAdminRateLimitEvents(ctx.db, query)
  })

  app.post('/admin/unlock-codes', { preHandler: requireAdminAuth }, async (request, reply) => {
    const body = createUnlockCodeBodySchema.parse(request.body)
    const namespace = await findNamespaceByPublicId(ctx.db, body.namespaceId)

    if (!namespace) {
      throw new AppError(404, 'NAMESPACE_NOT_FOUND', 'Namespace not found')
    }

    const result = await createUnlockCode(ctx.db, ctx.config, body)

    return reply.code(201).send(result)
  })

  app.get('/admin/namespaces/:namespaceId/limits', { preHandler: requireAdminAuth }, async (request) => {
    const { namespaceId } = request.params as { namespaceId: string }
    return getNamespaceLimits(ctx.db, ctx.config, namespaceId, limitBaselines)
  })

  app.patch('/admin/namespaces/:namespaceId/limits', { preHandler: requireAdminAuth }, async (request) => {
    const { namespaceId } = request.params as { namespaceId: string }
    const body = patchLimitOverridesSchema.parse(request.body ?? {})
    return patchNamespaceLimits(ctx.db, ctx.config, namespaceId, body, limitBaselines)
  })

  app.get('/admin/settings/limits', { preHandler: requireAdminAuth }, async () => {
    return getOperatorLimitSettings(ctx.db, ctx.config, limitBaselines)
  })

  app.patch('/admin/settings/limits', { preHandler: requireAdminAuth }, async (request) => {
    const body = patchLimitOverridesSchema.parse(request.body ?? {})
    return patchOperatorLimitSettings(ctx.db, ctx.config, limitBaselines, body)
  })

  app.get('/admin/settings/mail', { preHandler: requireAdminAuth }, async () => {
    return getMailSettings(ctx.db, ctx.config)
  })

  app.patch('/admin/settings/mail', { preHandler: requireAdminAuth }, async (request) => {
    const body = mailSettingsOverrideSchema.parse(request.body ?? {})
    return patchMailSettings(ctx.db, ctx.config, body)
  })

  app.post('/admin/danger/purge-all-records', { preHandler: requireAdminAuth }, async (request) => {
    purgeAllRecordsBodySchema.parse(request.body ?? {})
    return purgeAllRecords(ctx.db, ctx.config.blob.filesystem.path)
  })

  app.get('/admin/settings/sync', { preHandler: requireAdminAuth }, async () => {
    return {
      revisionRetentionDays: ctx.config.sync.revisionRetentionDays,
      revisionRetentionCount: ctx.config.sync.revisionRetentionCount,
      maxDocumentsPerNamespace: ctx.config.sync.maxDocumentsPerNamespace,
      maxEnvelopeBytes: ctx.config.sync.maxEnvelopeBytes,
    }
  })

  app.post('/admin/revisions/purge', { preHandler: requireAdminAuth }, async (request) => {
    const body = purgeRevisionsBodySchema.parse(request.body ?? {})

    if (body.mode === 'date') {
      return purgeRevisions(ctx.db, ctx.config.blob.filesystem.path, {
        mode: 'date',
        before: new Date(body.before!),
        scope: body.scope,
        namespaceId: body.scope === 'namespace' ? body.namespaceId : undefined,
        appId: body.scope === 'app' ? body.appId : undefined,
      })
    }

    return purgeRevisions(ctx.db, ctx.config.blob.filesystem.path, {
      mode: 'count',
      keepLastRevisions: body.keepLastRevisions!,
      scope: body.scope,
      namespaceId: body.scope === 'namespace' ? body.namespaceId : undefined,
      appId: body.scope === 'app' ? body.appId : undefined,
    })
  })
}
