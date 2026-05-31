import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createRequireAdminAuth } from '../middleware/auth-admin.js'
import {
  getAdminDeveloper,
  listAdminDevelopers,
  updateAdminDeveloper,
} from '../services/admin-developer-service.js'
import {
  getDeveloperLimits,
  patchDeveloperLimits,
} from '../services/operator-limit-service.js'
import { patchLimitOverridesSchema } from '../types/limit-overrides.js'
import type { AppContext } from '../types/context.js'

const developerIdParamSchema = z.object({
  developerId: z.string().uuid(),
})

const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().max(128).optional(),
  filter: z.enum(['all', 'verified', 'unverified', 'disabled']).optional(),
})

const updateDeveloperBodySchema = z
  .object({
    disabled: z.boolean().optional(),
    emailVerified: z.boolean().optional(),
  })
  .refine((body) => body.disabled !== undefined || body.emailVerified !== undefined, {
    message: 'At least one of disabled or emailVerified is required',
  })

export async function registerAdminDeveloperRoutes(app: FastifyInstance, ctx: AppContext) {
  const requireAdminAuth = createRequireAdminAuth(ctx)

  app.get('/admin/developers', { preHandler: requireAdminAuth }, async (request) => {
    const query = paginationQuerySchema.parse(request.query)
    return listAdminDevelopers(ctx.db, query)
  })

  app.get('/admin/developers/:developerId', { preHandler: requireAdminAuth }, async (request) => {
    const { developerId } = developerIdParamSchema.parse(request.params)
    return getAdminDeveloper(ctx.db, developerId)
  })

  app.patch('/admin/developers/:developerId', { preHandler: requireAdminAuth }, async (request) => {
    const { developerId } = developerIdParamSchema.parse(request.params)
    const body = updateDeveloperBodySchema.parse(request.body)
    return updateAdminDeveloper(ctx.db, developerId, body)
  })

  app.get('/admin/developers/:developerId/limits', { preHandler: requireAdminAuth }, async (request) => {
    const { developerId } = developerIdParamSchema.parse(request.params)
    return getDeveloperLimits(ctx.db, ctx.config, developerId)
  })

  app.patch('/admin/developers/:developerId/limits', { preHandler: requireAdminAuth }, async (request) => {
    const { developerId } = developerIdParamSchema.parse(request.params)
    const body = patchLimitOverridesSchema.parse(request.body ?? {})
    return patchDeveloperLimits(ctx.db, ctx.config, developerId, body)
  })
}
