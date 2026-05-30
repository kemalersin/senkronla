import type { FastifyServerOptions } from 'fastify'
import type { ServerConfig } from '../config/schema.js'
import { checkBlobStorage } from '../blob/filesystem.js'
import { checkDatabase, type DbPool } from '../db/pool.js'
import { isDeveloperPortalEnabled } from '../lib/developer-portal.js'

export interface HealthCheckResult {
  status: 'ok' | 'degraded'
  version: string
  database: {
    status: 'ok' | 'error'
    mode: 'bundled' | 'external'
    message?: string
  }
  blob: {
    status: 'ok' | 'error'
    path: string
    message?: string
  }
  websocket: boolean
  developerPortal: {
    enabled: boolean
  }
}

export async function runHealthChecks(
  pool: DbPool,
  config: ServerConfig,
  databaseMode: 'bundled' | 'external',
): Promise<HealthCheckResult> {
  let databaseStatus: HealthCheckResult['database'] = {
    status: 'ok',
    mode: databaseMode,
  }
  let blobStatus: HealthCheckResult['blob'] = {
    status: 'ok',
    path: config.blob.filesystem.path,
  }

  try {
    await checkDatabase(pool)
  } catch (error) {
    databaseStatus = {
      status: 'error',
      mode: databaseMode,
      message: error instanceof Error ? error.message : 'Database check failed',
    }
  }

  try {
    await checkBlobStorage(config.blob.filesystem.path)
  } catch (error) {
    blobStatus = {
      status: 'error',
      path: config.blob.filesystem.path,
      message: error instanceof Error ? error.message : 'Blob storage check failed',
    }
  }

  const isHealthy = databaseStatus.status === 'ok' && blobStatus.status === 'ok'

  return {
    status: isHealthy ? 'ok' : 'degraded',
    version: '0.1.0',
    database: databaseStatus,
    blob: blobStatus,
    websocket: config.websocket.enabled,
    developerPortal: {
      enabled: isDeveloperPortalEnabled(config),
    },
  }
}

export function createLoggerOptions(config: ServerConfig): FastifyServerOptions['logger'] {
  const transport =
    config.logging.format === 'pretty' && process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined

  return {
    level: config.logging.level,
    redact: {
      paths: config.logging.redactPaths,
      censor: '[REDACTED]',
    },
    ...(transport ? { transport } : {}),
  }
}
