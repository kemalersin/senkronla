import type { FastifyInstance } from 'fastify'
import { NATIVE_PLATFORMS } from '@senkronla/protocol'
import { z } from 'zod'
import { APP_ID_PATTERN, APP_ID_VALIDATION_MESSAGE, normalizeAppId } from '../lib/app-id.js'
import {
  createRequireDeveloperAuth,
  createRequireDeveloperPortal,
} from '../middleware/auth-developer.js'
import {
  changeDeveloperPassword,
  getDeveloperProfile,
  loginDeveloper,
  logoutDeveloper,
  registerDeveloper,
  requestDeveloperPasswordReset,
  resendDeveloperVerification,
  resetDeveloperPassword,
  verifyDeveloperEmail,
} from '../services/developer-auth-service.js'
import {
  addDeveloperAppBundle,
  addDeveloperAppOrigin,
  archiveDeveloperApp,
  createDeveloperApp,
  deleteDeveloperAppOrigin,
  getDeveloperApp,
  listDeveloperApps,
  rotateDeveloperAppSecret,
  updateDeveloperApp,
  verifyDeveloperAppOrigin,
} from '../services/developer-app-service.js'
import type { AppContext } from '../types/context.js'

const registerBodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(256),
  locale: z.enum(['en', 'tr']).optional(),
})

const loginBodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(256),
})

const emailLocaleBodySchema = z.object({
  email: z.string().email().max(320),
  locale: z.enum(['en', 'tr']).optional(),
})

const verifyEmailBodySchema = z.object({
  token: z.string().min(16).max(512),
})

const resetPasswordBodySchema = z.object({
  token: z.string().min(16).max(512),
  newPassword: z.string().min(8).max(256),
})

const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
})

const createAppBodySchema = z.object({
  name: z.string().min(1).max(256),
  type: z.enum(['web', 'native']),
})

const updateAppBodySchema = z.object({
  name: z.string().min(1).max(256),
})

const addOriginBodySchema = z.object({
  origin: z.string().url(),
})

const addBundleBodySchema = z.object({
  platform: z.enum(NATIVE_PLATFORMS),
  bundleId: z.string().min(1).max(256),
})

const appIdParamSchema = z.object({
  appId: z
    .string()
    .transform(normalizeAppId)
    .refine((value) => APP_ID_PATTERN.test(value), { message: APP_ID_VALIDATION_MESSAGE }),
})

const originIdParamSchema = appIdParamSchema.extend({
  originId: z.string().uuid(),
})

const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().max(128).optional(),
  status: z
    .enum(['pending', 'pending_verification', 'active', 'suspended', 'archived'])
    .optional(),
})

export async function registerDeveloperRoutes(app: FastifyInstance, ctx: AppContext) {
  const requireDeveloperPortal = createRequireDeveloperPortal(ctx)
  const requireDeveloperAuth = createRequireDeveloperAuth(ctx)

  app.post('/developer/register', { preHandler: requireDeveloperPortal }, async (request, reply) => {
    const body = registerBodySchema.parse(request.body)
    const result = await registerDeveloper(ctx.db, ctx.config, body)

    if (!result.token) {
      return reply.code(201).send({
        developer: result.developer,
        message: 'Account created. Verify your email before signing in.',
      })
    }

    return reply.code(201).send(result)
  })

  app.post('/developer/login', { preHandler: requireDeveloperPortal }, async (request) => {
    const body = loginBodySchema.parse(request.body)
    return loginDeveloper(ctx.db, ctx.config, body)
  })

  app.post('/developer/logout', { preHandler: requireDeveloperAuth }, async (request) => {
    await logoutDeveloper(ctx.db, request.developerAuth!.developerUuid)
    return { ok: true }
  })

  app.get('/developer/me', { preHandler: requireDeveloperAuth }, async (request) => {
    return getDeveloperProfile(ctx.db, request.developerAuth!.developerUuid)
  })

  app.patch('/developer/password', { preHandler: requireDeveloperAuth }, async (request) => {
    const body = changePasswordBodySchema.parse(request.body)
    return changeDeveloperPassword(ctx.db, request.developerAuth!.developerUuid, body)
  })

  app.post('/developer/verify-email', { preHandler: requireDeveloperPortal }, async (request) => {
    const body = verifyEmailBodySchema.parse(request.body)
    return verifyDeveloperEmail(ctx.db, ctx.config, body.token)
  })

  app.post('/developer/resend-verification', { preHandler: requireDeveloperPortal }, async (request) => {
    const body = emailLocaleBodySchema.parse(request.body)
    return resendDeveloperVerification(ctx.db, ctx.config, body)
  })

  app.post('/developer/request-password-reset', { preHandler: requireDeveloperPortal }, async (request) => {
    const body = emailLocaleBodySchema.parse(request.body)
    return requestDeveloperPasswordReset(ctx.db, ctx.config, body)
  })

  app.post('/developer/reset-password', { preHandler: requireDeveloperPortal }, async (request) => {
    const body = resetPasswordBodySchema.parse(request.body)
    return resetDeveloperPassword(ctx.db, ctx.config, body)
  })

  app.get('/developer/apps', { preHandler: requireDeveloperAuth }, async (request) => {
    const query = paginationQuerySchema.parse(request.query)
    return listDeveloperApps(ctx.db, ctx.config, request.developerAuth!.developerUuid, query)
  })

  app.post('/developer/apps', { preHandler: requireDeveloperAuth }, async (request, reply) => {
    const body = createAppBodySchema.parse(request.body)
    const result = await createDeveloperApp(
      ctx.db,
      ctx.config,
      request.developerAuth!.developerUuid,
      body,
    )
    return reply.code(201).send(result)
  })

  app.get('/developer/apps/:appId', { preHandler: requireDeveloperAuth }, async (request) => {
    const { appId } = appIdParamSchema.parse(request.params)
    return getDeveloperApp(ctx.db, ctx.config, request.developerAuth!.developerUuid, appId)
  })

  app.patch('/developer/apps/:appId', { preHandler: requireDeveloperAuth }, async (request) => {
    const { appId } = appIdParamSchema.parse(request.params)
    const body = updateAppBodySchema.parse(request.body)
    return updateDeveloperApp(ctx.db, ctx.config, request.developerAuth!.developerUuid, appId, body)
  })

  app.delete('/developer/apps/:appId', { preHandler: requireDeveloperAuth }, async (request) => {
    const { appId } = appIdParamSchema.parse(request.params)
    return archiveDeveloperApp(ctx.db, ctx.config, request.developerAuth!.developerUuid, appId)
  })

  app.post(
    '/developer/apps/:appId/origins',
    { preHandler: requireDeveloperAuth },
    async (request, reply) => {
      const { appId } = appIdParamSchema.parse(request.params)
      const body = addOriginBodySchema.parse(request.body)
      const result = await addDeveloperAppOrigin(
        ctx.db,
        ctx.config,
        request.developerAuth!.developerUuid,
        appId,
        body,
      )
      return reply.code(201).send(result)
    },
  )

  app.delete(
    '/developer/apps/:appId/origins/:originId',
    { preHandler: requireDeveloperAuth },
    async (request) => {
      const { appId, originId } = originIdParamSchema.parse(request.params)
      return deleteDeveloperAppOrigin(
        ctx.db,
        ctx.config,
        request.developerAuth!.developerUuid,
        appId,
        originId,
      )
    },
  )

  app.post(
    '/developer/apps/:appId/origins/:originId/verify',
    { preHandler: requireDeveloperAuth },
    async (request) => {
      const { appId, originId } = originIdParamSchema.parse(request.params)
      return verifyDeveloperAppOrigin(
        ctx.db,
        ctx.config,
        request.developerAuth!.developerUuid,
        appId,
        originId,
      )
    },
  )

  app.post(
    '/developer/apps/:appId/bundles',
    { preHandler: requireDeveloperAuth },
    async (request, reply) => {
      const { appId } = appIdParamSchema.parse(request.params)
      const body = addBundleBodySchema.parse(request.body)
      const result = await addDeveloperAppBundle(
        ctx.db,
        ctx.config,
        request.developerAuth!.developerUuid,
        appId,
        body,
      )
      return reply.code(201).send(result)
    },
  )

  app.post(
    '/developer/apps/:appId/rotate-secret',
    { preHandler: requireDeveloperAuth },
    async (request) => {
      const { appId } = appIdParamSchema.parse(request.params)
      return rotateDeveloperAppSecret(
        ctx.db,
        ctx.config,
        request.developerAuth!.developerUuid,
        appId,
      )
    },
  )
}
