import { createHash, timingSafeEqual } from 'node:crypto'
import { isNativePlatform, type NativePlatform } from '@senkronla/protocol'
import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { isLocalhostOrigin, normalizeOrigin, parseRefererOrigin } from '../lib/app-origin.js'
import type { AppBundleRow, AppOriginRow, AppRow } from '../types/db.js'

export interface AppAuthContext {
  appUuid: string
  appId: string
  type: 'web' | 'native'
}

export interface ValidateAppContextOptions {
  allowOriginOnly?: boolean
}

function hashClientSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function constantTimeSecretMatch(provided: string, expectedHash: string | null): boolean {
  if (!expectedHash) {
    return false
  }

  const providedHash = hashClientSecret(provided)
  const a = Buffer.from(providedHash, 'utf8')
  const b = Buffer.from(expectedHash, 'utf8')

  if (a.length !== b.length) {
    return false
  }

  return timingSafeEqual(a, b)
}

export async function findAppByPublicId(pool: DbPool, appId: string): Promise<AppRow | null> {
  const result = await pool.query<AppRow>(
    `SELECT id, app_id, developer_uuid, name, type, status, client_secret_hash,
            limit_overrides, created_at, updated_at
     FROM apps
     WHERE app_id = $1`,
    [appId],
  )

  return result.rows[0] ?? null
}

export async function findAppUuidByPublicId(pool: DbPool, appId: string): Promise<string | null> {
  const app = await findAppByPublicId(pool, appId)
  return app?.id ?? null
}

async function isOriginRegistered(pool: DbPool, appUuid: string, origin: string): Promise<boolean> {
  const result = await pool.query<Pick<AppOriginRow, 'id'>>(
    `SELECT id
     FROM app_origins
     WHERE app_uuid = $1
       AND origin = $2
       AND verified_at IS NOT NULL`,
    [appUuid, origin],
  )

  return result.rows.length > 0
}

async function isBundleRegistered(
  pool: DbPool,
  appUuid: string,
  platform: NativePlatform,
  bundleId: string,
): Promise<boolean> {
  const result = await pool.query<Pick<AppBundleRow, 'id'>>(
    `SELECT id
     FROM app_bundles
     WHERE app_uuid = $1
       AND platform = $2
       AND bundle_id = $3
       AND verified_at IS NOT NULL`,
    [appUuid, platform, bundleId],
  )

  return result.rows.length > 0
}

export async function findActiveAppByVerifiedOrigin(
  pool: DbPool,
  origin: string,
): Promise<AppRow | null> {
  const result = await pool.query<AppRow>(
    `SELECT a.id, a.app_id, a.developer_uuid, a.name, a.type, a.status, a.client_secret_hash,
            a.created_at, a.updated_at
     FROM apps a
     INNER JOIN app_origins o ON o.app_uuid = a.id
     WHERE o.origin = $1
       AND o.verified_at IS NOT NULL
       AND a.status = 'active'
       AND a.type = 'web'`,
    [origin],
  )

  if (result.rows.length !== 1) {
    return null
  }

  return result.rows[0] ?? null
}

export async function isOriginAllowedByRegistry(
  pool: DbPool,
  config: ServerConfig,
  origin: string | undefined,
): Promise<boolean> {
  if (!origin) {
    return false
  }

  if (config.apps.allowLocalhostOrigins && isLocalhostOrigin(origin)) {
    return true
  }

  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM app_origins o
       INNER JOIN apps a ON a.id = o.app_uuid
       WHERE o.origin = $1
         AND o.verified_at IS NOT NULL
         AND a.status = 'active'
     ) AS exists`,
    [origin],
  )

  return result.rows[0]?.exists ?? false
}

export async function validateAppContext(
  pool: DbPool,
  config: ServerConfig,
  headers: Record<string, string | string[] | undefined>,
  options: ValidateAppContextOptions = {},
): Promise<AppAuthContext> {
  if (!config.apps.enabled) {
    throw new AppError(500, 'INTERNAL_ERROR', 'App context validation called while apps.enabled is false')
  }

  const headerValue = (name: string): string | undefined => {
    const raw = headers[name] ?? headers[name.toLowerCase()]
    if (Array.isArray(raw)) {
      return raw[0]
    }

    return raw
  }

  let appId = headerValue('x-esr-app-id')
  const originHeader = headerValue('origin')
  const refererOrigin = parseRefererOrigin(headerValue('referer'))
  let origin = originHeader ?? refererOrigin ?? undefined

  if (origin) {
    try {
      origin = normalizeOrigin(origin)
    } catch {
      throw new AppError(403, 'APP_ORIGIN_NOT_ALLOWED', 'Origin header is invalid', { origin: originHeader })
    }
  }

  if (!appId && options.allowOriginOnly && origin) {
    const appByOrigin = await findActiveAppByVerifiedOrigin(pool, origin)
    if (appByOrigin) {
      appId = appByOrigin.app_id
    }
  }

  if (!appId) {
    throw new AppError(400, 'APP_ID_REQUIRED', 'X-ESR-App-Id header is required')
  }

  const app = await findAppByPublicId(pool, appId)
  if (!app) {
    throw new AppError(403, 'APP_NOT_FOUND', 'Application is not registered')
  }

  if (app.status === 'suspended') {
    throw new AppError(403, 'APP_SUSPENDED', 'Application is suspended')
  }

  if (app.status !== 'active') {
    throw new AppError(403, 'APP_NOT_VERIFIED', 'Application is not active', { status: app.status })
  }

  if (app.type === 'web') {
    if (!origin) {
      throw new AppError(400, 'APP_ORIGIN_REQUIRED', 'Origin header is required for web applications')
    }

    const originAllowed =
      (config.apps.allowLocalhostOrigins && isLocalhostOrigin(origin)) ||
      (await isOriginRegistered(pool, app.id, origin))

    if (!originAllowed) {
      throw new AppError(403, 'APP_ORIGIN_NOT_ALLOWED', 'Origin is not registered for this application', {
        origin,
      })
    }
  }

  if (app.type === 'native') {
    const platform = headerValue('x-esr-platform')
    const bundleId = headerValue('x-esr-bundle-id')

    if (!platform || !bundleId) {
      throw new AppError(400, 'APP_NATIVE_ID_REQUIRED', 'X-ESR-Platform and X-ESR-Bundle-Id headers are required')
    }

    if (!isNativePlatform(platform)) {
      throw new AppError(400, 'APP_NATIVE_ID_REQUIRED', 'X-ESR-Platform must be ios, android, or desktop')
    }

    const bundleAllowed = await isBundleRegistered(pool, app.id, platform, bundleId)
    if (!bundleAllowed) {
      throw new AppError(403, 'APP_BUNDLE_NOT_ALLOWED', 'Bundle id is not registered for this application', {
        platform,
        bundleId,
      })
    }

    if (config.apps.native.requireClientSecret) {
      const secret = headerValue('x-esr-client-secret')
      if (!secret || !constantTimeSecretMatch(secret, app.client_secret_hash)) {
        throw new AppError(401, 'APP_CLIENT_SECRET_INVALID', 'Client secret is invalid')
      }
    }
  }

  return {
    appUuid: app.id,
    appId: app.app_id,
    type: app.type,
  }
}

export async function assertNamespaceAppAccess(
  pool: DbPool,
  config: ServerConfig,
  namespaceAppUuid: string | null,
  appAuth: AppAuthContext,
): Promise<void> {
  if (!config.apps.enabled) {
    return
  }

  let expectedAppUuid = namespaceAppUuid

  if (!expectedAppUuid && config.apps.legacyDefaultAppId) {
    expectedAppUuid = await findAppUuidByPublicId(pool, config.apps.legacyDefaultAppId)
  }

  if (!expectedAppUuid) {
    throw new AppError(403, 'APP_NAMESPACE_MISMATCH', 'Namespace is not bound to an application')
  }

  if (expectedAppUuid !== appAuth.appUuid) {
    throw new AppError(403, 'APP_NAMESPACE_MISMATCH', 'Namespace belongs to another application')
  }
}

export async function seedAppsFromConfig(pool: DbPool, config: ServerConfig): Promise<void> {
  if (!config.apps.enabled || config.apps.seed.length === 0) {
    return
  }

  for (const entry of config.apps.seed) {
    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const appResult = await client.query<AppRow>(
        `INSERT INTO apps (app_id, name, type, status, client_secret_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (app_id) DO UPDATE
           SET name = EXCLUDED.name,
               type = EXCLUDED.type,
               status = EXCLUDED.status,
               client_secret_hash = EXCLUDED.client_secret_hash,
               updated_at = now()
         RETURNING id, app_id, developer_uuid, name, type, status, client_secret_hash, created_at, updated_at`,
        [entry.appId, entry.name, entry.type, entry.status, entry.clientSecretHash ?? null],
      )

      const app = appResult.rows[0]
      if (!app) {
        throw new AppError(500, 'INTERNAL_ERROR', `Failed to seed app ${entry.appId}`)
      }

      for (const origin of entry.origins) {
        await client.query(
          `INSERT INTO app_origins (app_uuid, origin, verification_token, verified_at)
           VALUES ($1, $2, '', now())
           ON CONFLICT (app_uuid, origin) DO UPDATE
             SET verified_at = COALESCE(app_origins.verified_at, now())`,
          [app.id, origin],
        )
      }

      if (entry.bundleIds?.ios) {
        await client.query(
          `INSERT INTO app_bundles (app_uuid, platform, bundle_id, verified_at)
           VALUES ($1, 'ios', $2, now())
           ON CONFLICT (app_uuid, platform, bundle_id) DO UPDATE
             SET verified_at = COALESCE(app_bundles.verified_at, now())`,
          [app.id, entry.bundleIds.ios],
        )
      }

      if (entry.bundleIds?.android) {
        await client.query(
          `INSERT INTO app_bundles (app_uuid, platform, bundle_id, verified_at)
           VALUES ($1, 'android', $2, now())
           ON CONFLICT (app_uuid, platform, bundle_id) DO UPDATE
             SET verified_at = COALESCE(app_bundles.verified_at, now())`,
          [app.id, entry.bundleIds.android],
        )
      }

      if (entry.bundleIds?.desktop) {
        await client.query(
          `INSERT INTO app_bundles (app_uuid, platform, bundle_id, verified_at)
           VALUES ($1, 'desktop', $2, now())
           ON CONFLICT (app_uuid, platform, bundle_id) DO UPDATE
             SET verified_at = COALESCE(app_bundles.verified_at, now())`,
          [app.id, entry.bundleIds.desktop],
        )
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}
