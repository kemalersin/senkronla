import type { FastifyInstance } from 'fastify'
import { NATIVE_PLATFORMS } from '@senkronla/protocol'
import { z } from 'zod'
import { APP_ID_PATTERN, APP_ID_VALIDATION_MESSAGE, normalizeAppId } from '../lib/app-id.js'
import { createRequireAdminAuth } from '../middleware/auth-admin.js'
import {
  addAdminAppBundle,
  addAdminAppOrigin,
  approveAdminAppBundle,
  archiveAdminApp,
  createAdminApp,
  deleteAdminAppOrigin,
  getAdminApp,
  listAdminApps,
  updateAdminApp,
  verifyAdminAppOrigin,
} from '../services/admin-app-service.js'
import {
  getAppLimits,
  patchAppLimits,
} from '../services/operator-limit-service.js'
import { getRuntimeLimitBaselines } from '../services/limit-resolution-service.js'
import { patchLimitOverridesSchema } from '../types/limit-overrides.js'
import type { AppContext } from '../types/context.js'

const appIdSchema = z
  .string()
  .transform(normalizeAppId)
  .refine((value) => APP_ID_PATTERN.test(value), { message: APP_ID_VALIDATION_MESSAGE })

const appIdParamSchema = z.object({
  appId: appIdSchema,
})

const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().max(128).optional(),
  status: z
    .enum(['pending', 'pending_verification', 'active', 'suspended', 'archived'])
    .optional(),
  developerId: z.string().uuid().optional(),
})

const createAppBodySchema = z.object({
  appId: appIdSchema,
  name: z.string().min(1).max(256),
  type: z.enum(['web', 'native']),
  status: z
    .enum(['pending', 'pending_verification', 'active', 'suspended', 'archived'])
    .optional(),
  origins: z.array(z.string().url()).optional(),
  bundleIds: z
    .object({
      ios: z.string().min(1).optional(),
      android: z.string().min(1).optional(),
      desktop: z.string().min(1).optional(),
    })
    .optional(),
  clientSecret: z.string().min(16).optional(),
})

const updateAppBodySchema = z
  .object({
    name: z.string().min(1).max(256).optional(),
    status: z
      .enum(['pending', 'pending_verification', 'active', 'suspended', 'archived'])
      .optional(),
  })
  .refine((body) => body.name !== undefined || body.status !== undefined, {
    message: 'At least one of name or status is required',
  })

const addOriginBodySchema = z.object({
  origin: z.string().url(),
  verified: z.boolean().optional(),
})

const addBundleBodySchema = z.object({
  platform: z.enum(NATIVE_PLATFORMS),
  bundleId: z.string().min(1).max(256),
  verified: z.boolean().optional(),
})

const originIdParamSchema = appIdParamSchema.extend({
  originId: z.string().uuid(),
})

const bundleIdParamSchema = appIdParamSchema.extend({
  bundleId: z.string().uuid(),
})

export async function registerAdminAppRoutes(app: FastifyInstance, ctx: AppContext) {
  const requireAdminAuth = createRequireAdminAuth(ctx)
  const limitBaselines = getRuntimeLimitBaselines(ctx.config)

  app.get('/admin/apps', { preHandler: requireAdminAuth }, async (request) => {
    const query = paginationQuerySchema.parse(request.query)
    return listAdminApps(ctx.db, query)
  })

  app.post('/admin/apps', { preHandler: requireAdminAuth }, async (request, reply) => {
    const body = createAppBodySchema.parse(request.body)
    const result = await createAdminApp(ctx.db, ctx.config, body)
    return reply.code(201).send(result)
  })

  app.get('/admin/apps/:appId', { preHandler: requireAdminAuth }, async (request) => {
    const { appId } = appIdParamSchema.parse(request.params)
    return getAdminApp(ctx.db, ctx.config, appId)
  })

  app.patch('/admin/apps/:appId', { preHandler: requireAdminAuth }, async (request) => {
    const { appId } = appIdParamSchema.parse(request.params)
    const body = updateAppBodySchema.parse(request.body)
    return updateAdminApp(ctx.db, ctx.config, appId, body)
  })

  app.delete('/admin/apps/:appId', { preHandler: requireAdminAuth }, async (request) => {
    const { appId } = appIdParamSchema.parse(request.params)
    return archiveAdminApp(ctx.db, ctx.config, appId)
  })

  app.post('/admin/apps/:appId/origins', { preHandler: requireAdminAuth }, async (request, reply) => {
    const { appId } = appIdParamSchema.parse(request.params)
    const body = addOriginBodySchema.parse(request.body)
    const result = await addAdminAppOrigin(ctx.db, ctx.config, appId, body)
    return reply.code(201).send(result)
  })

  app.delete(
    '/admin/apps/:appId/origins/:originId',
    { preHandler: requireAdminAuth },
    async (request) => {
      const { appId, originId } = originIdParamSchema.parse(request.params)
      return deleteAdminAppOrigin(ctx.db, ctx.config, appId, originId)
    },
  )

  app.post(
    '/admin/apps/:appId/origins/:originId/verify',
    { preHandler: requireAdminAuth },
    async (request) => {
      const { appId, originId } = originIdParamSchema.parse(request.params)
      return verifyAdminAppOrigin(ctx.db, ctx.config, appId, originId)
    },
  )

  app.post('/admin/apps/:appId/bundles', { preHandler: requireAdminAuth }, async (request, reply) => {
    const { appId } = appIdParamSchema.parse(request.params)
    const body = addBundleBodySchema.parse(request.body)
    const result = await addAdminAppBundle(ctx.db, ctx.config, appId, body)
    return reply.code(201).send(result)
  })

  app.post(
    '/admin/apps/:appId/bundles/:bundleId/approve',
    { preHandler: requireAdminAuth },
    async (request) => {
      const { appId, bundleId } = bundleIdParamSchema.parse(request.params)
      return approveAdminAppBundle(ctx.db, ctx.config, appId, bundleId)
    },
  )

  app.get('/admin/apps/:appId/limits', { preHandler: requireAdminAuth }, async (request) => {
    const { appId } = appIdParamSchema.parse(request.params)
    return getAppLimits(ctx.db, ctx.config, appId, limitBaselines)
  })

  app.patch('/admin/apps/:appId/limits', { preHandler: requireAdminAuth }, async (request) => {
    const { appId } = appIdParamSchema.parse(request.params)
    const body = patchLimitOverridesSchema.parse(request.body ?? {})
    return patchAppLimits(ctx.db, ctx.config, appId, body, limitBaselines)
  })
}
