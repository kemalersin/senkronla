import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify from 'fastify'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { getDatabaseMode, type ServerConfig } from './config.js'
import type { DbPool } from './db/pool.js'
import { createLoggerOptions, runHealthChecks } from './health/checks.js'
import {
  applyRateLimitHeaders,
  RATE_LIMIT_EXPOSED_HEADERS,
  sendRateLimitHeaders,
  trackRateLimitQuota,
} from './lib/rate-limit-headers.js'
import { registerApiRoutes } from './routes/index.js'
import { NotificationHub } from './services/notification-hub.js'
import { isAppError } from './errors/app-error.js'
import {
  enforceRateLimit,
  getGlobalIpRateLimitRule,
  type RateLimitQuota,
} from './services/rate-limit-service.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function loadOpenApiSpec(): Record<string, unknown> {
  const specPath = join(repoRoot, 'openapi.yaml')
  const raw = readFileSync(specPath, 'utf8')
  return parse(raw) as Record<string, unknown>
}

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
}

export async function buildApp({ config, db }: AppDependencies) {
  const app = Fastify({
    logger: createLoggerOptions(config),
    trustProxy: config.server.trustProxy,
  })

  await app.register(cors, {
    origin: config.cors.allowedOrigins.includes('*') ? true : config.cors.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: [...RATE_LIMIT_EXPOSED_HEADERS],
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

  const openApiSpec = loadOpenApiSpec()

  await app.register(swagger, {
    openapi: openApiSpec,
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  })

  app.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Health check',
    },
  }, async (_request, reply) => {
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
