import type { FastifyServerOptions } from 'fastify'
import type { ServerConfig } from '../config/schema.js'
import { checkBlobStorage } from '../blob/filesystem.js'
import { checkDatabase, type DbPool } from '../db/pool.js'
import { isDeveloperPortalEnabled } from '../lib/developer-portal.js'
import { SERVER_VERSION } from '../version.js'

export interface HealthBlobOperatorDetails {
  status: 'ok' | 'error'
  path: string
  message?: string
}

export interface HealthBlobPublicSummary {
  status: 'ok' | 'error'
}

export interface HealthCheckResult {
  status: 'ok' | 'degraded'
  version: string
  database: {
    status: 'ok' | 'error'
    mode: 'bundled' | 'external'
    message?: string
  }
  blob: HealthBlobOperatorDetails
  websocket: boolean
  developerPortal: {
    enabled: boolean
  }
  apps: {
    enabled: boolean
    nativeRequireClientSecret: boolean
  }
}

export type PublicHealthResponse = Omit<HealthCheckResult, 'blob'> & {
  blob: HealthBlobPublicSummary
}

export function toHealthResponse(
  result: HealthCheckResult,
  includeOperatorDetails: boolean,
): HealthCheckResult | PublicHealthResponse {
  if (includeOperatorDetails) {
    return result
  }

  return {
    ...result,
    blob: { status: result.blob.status },
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
    version: SERVER_VERSION,
    database: databaseStatus,
    blob: blobStatus,
    websocket: config.websocket.enabled,
    developerPortal: {
      enabled: isDeveloperPortalEnabled(config),
    },
    apps: {
      enabled: config.apps.enabled,
      nativeRequireClientSecret: config.apps.native.requireClientSecret,
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
