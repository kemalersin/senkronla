import type { FastifyInstance } from 'fastify'
import { registerErrorHandler } from '../errors/handler.js'
import { registerDeviceRoutes } from './devices.js'
import { registerDocumentRoutes } from './documents.js'
import { registerNamespaceRoutes } from './namespaces.js'
import { registerRecoveryRoutes } from './recovery.js'
import { registerUnlockRoutes } from './unlock.js'
import { registerAdminRoutes } from './admin.js'
import { registerNotificationRoutes } from './notifications.js'
import type { AppContext } from '../types/context.js'

export async function registerApiRoutes(app: FastifyInstance, ctx: AppContext) {
  registerErrorHandler(app)

  await app.register(
    async (v1) => {
      await registerNamespaceRoutes(v1, ctx)
      await registerDeviceRoutes(v1, ctx)
      await registerDocumentRoutes(v1, ctx)
      await registerRecoveryRoutes(v1, ctx)
      await registerUnlockRoutes(v1, ctx)
      await registerAdminRoutes(v1, ctx)
      await registerNotificationRoutes(v1, ctx)
    },
    { prefix: '/v1' },
  )
}
