import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyReply } from 'fastify'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDatabaseMode, type ServerConfig } from './config.js'
import type { DbPool } from './db/pool.js'
import { createLoggerOptions, runHealthChecks } from './health/checks.js'
import {
  applyRateLimitHeaders,
  RATE_LIMIT_EXPOSED_HEADERS,
  sendRateLimitHeaders,
  trackRateLimitQuota,
} from './lib/rate-limit-headers.js'
import { enforceAppContext } from './middleware/auth-app.js'
import { isLocalhostOrigin } from './lib/app-origin.js'
import { registerApiRoutes } from './routes/index.js'
import { isOriginAllowedByRegistry } from './services/app-registry-service.js'
import { NotificationHub } from './services/notification-hub.js'
import { type AppError, isAppError } from './errors/app-error.js'
import {
  enforceRateLimit,
  getGlobalIpRateLimitRule,
  type RateLimitQuota,
} from './services/rate-limit-service.js'
import { buildLimitBaselines, setRuntimeLimitBaselines } from './services/limit-resolution-service.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const openApiSpecPath = join(repoRoot, 'openapi.yaml')

function applyRateLimitErrorHeaders(reply: FastifyReply, error: AppError): void {
  const retryAfterSeconds = error.details.retryAfterSeconds
  if (typeof retryAfterSeconds === 'number') {
    reply.header('Retry-After', String(retryAfterSeconds))
  }

  const rateLimit = error.details.rateLimit
  if (rateLimit && typeof rateLimit === 'object') {
    applyRateLimitHeaders(reply, rateLimit as RateLimitQuota)
  }
}

export interface AppDependencies {
  config: ServerConfig
  db: DbPool
  env?: NodeJS.ProcessEnv
}

export async function buildApp({ config, db, env = process.env }: AppDependencies) {
  setRuntimeLimitBaselines(buildLimitBaselines(env))

  const app = Fastify({
    logger: createLoggerOptions(config),
    trustProxy: config.server.trustProxy,
  })

  const staticCorsOrigins = config.cors.allowedOrigins

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true)
        return
      }

      if (!config.apps.enabled) {
        if (staticCorsOrigins.includes('*')) {
          callback(null, true)
          return
        }

        callback(null, staticCorsOrigins.includes(origin))
        return
      }

      if (config.apps.allowLocalhostOrigins && isLocalhostOrigin(origin)) {
        callback(null, origin)
        return
      }

      void isOriginAllowedByRegistry(db, config, origin)
        .then((allowed) => {
          if (allowed) {
            callback(null, origin)
            return
          }

          if (!staticCorsOrigins.includes('*') && staticCorsOrigins.includes(origin)) {
            callback(null, origin)
            return
          }

          callback(null, false)
        })
        .catch((error) => {
          callback(error as Error, false)
        })
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-ESR-App-Id',
      'X-ESR-Platform',
      'X-ESR-Bundle-Id',
      'X-ESR-Client-Secret',
      'X-ESR-Client-Version',
    ],
    exposedHeaders: [...RATE_LIMIT_EXPOSED_HEADERS],
  })

  app.addHook('onRequest', async (request) => {
    await enforceAppContext({ config, db }, request, {
      allowOriginOnly: request.url.split('?')[0]?.endsWith('/notifications') ?? false,
    })
  })

  app.addHook('onRequest', async (request, reply) => {
    if (!config.limits.rateLimit.enabled) {
      return
    }

    const path = request.url.split('?')[0] ?? request.url
    if (path === '/health' || path === config.metrics.path || path.startsWith('/docs')) {
      return
    }

    if (path.endsWith('/notifications')) {
      return
    }

    try {
      const quota = await enforceRateLimit(db, config, getGlobalIpRateLimitRule(config), {
        clientIp: request.ip,
      })
      trackRateLimitQuota(request, quota)
    } catch (error) {
      if (isAppError(error) && error.code === 'RATE_LIMIT_EXCEEDED') {
        applyRateLimitErrorHeaders(reply, error)
      }

      throw error
    }
  })

  app.addHook('onSend', async (request, reply) => {
    sendRateLimitHeaders(request, reply)
  })

  await app.register(swagger, {
    mode: 'static',
    specification: {
      path: openApiSpecPath,
      baseDir: repoRoot,
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  })

  app.get('/health', async (_request, reply) => {
    const result = await runHealthChecks(db, config, getDatabaseMode(config.database.url))

    if (result.status !== 'ok') {
      return reply.code(503).send(result)
    }

    return result
  })

  if (config.metrics.enabled) {
    app.get(config.metrics.path, async () => ({
      uptimeSeconds: process.uptime(),
    }))
  }

  const notificationHub = config.websocket.enabled ? new NotificationHub() : undefined

  await registerApiRoutes(app, {
    config,
    db,
    notificationHub,
  })

  app.addHook('onClose', async () => {
    notificationHub?.destroy()
    await db.end()
  })

  return app
}
