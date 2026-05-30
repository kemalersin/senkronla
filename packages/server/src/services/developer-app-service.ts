import type { NativePlatform } from '@senkronla/protocol'
import { createHash, randomBytes } from 'node:crypto'
import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { findAppByPublicId } from './app-registry-service.js'
import { maybeActivateAppAfterVerification } from './origin-verification-service.js'
import {
  buildAdminAppDetail,
  assertAppNotArchived,
  type AdminAppDetail,
  type AdminAppSummary,
  type PaginatedAppsResult,
} from './admin-app-service.js'
import { generateVerificationToken, normalizeOriginForRegistration, verifyAppOrigin } from './origin-verification-service.js'
import type { AppRow } from '../types/db.js'
import type { VerifyOriginResult } from './origin-verification-service.js'

export interface CreateDeveloperAppInput {
  name: string
  type: 'web' | 'native'
}

export interface UpdateDeveloperAppInput {
  name: string
}

export interface AddDeveloperAppOriginInput {
  origin: string
}

export interface AddDeveloperAppBundleInput {
  platform: NativePlatform
  bundleId: string
}

export interface RotateDeveloperAppSecretResult {
  clientSecret: string
  app: AdminAppDetail
}

function hashClientSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function generatePublicAppId(): string {
  return `esr_app_${randomBytes(8).toString('hex')}`
}

async function requireOwnedApp(
  pool: DbPool,
  developerUuid: string,
  appId: string,
): Promise<AppRow> {
  const app = await findAppByPublicId(pool, appId)
  if (!app) {
    throw new AppError(404, 'NOT_FOUND', 'Application not found')
  }

  if (app.developer_uuid !== developerUuid) {
    throw new AppError(403, 'DEVELOPER_FORBIDDEN', 'Application does not belong to this developer')
  }

  return app
}

async function assertDeveloperAppQuota(
  pool: DbPool,
  config: ServerConfig,
  developerUuid: string,
): Promise<void> {
  const maxApps = config.apps.limits.perDeveloper.maxApps
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM apps
     WHERE developer_uuid = $1 AND status != 'archived'`,
    [developerUuid],
  )

  if (Number(result.rows[0]?.count ?? 0) >= maxApps) {
    throw new AppError(403, 'DEVELOPER_APP_LIMIT_REACHED', 'Developer app limit reached', {
      maxApps,
    })
  }
}

async function transitionAppStatus(
  pool: DbPool,
  appUuid: string,
  status: string,
): Promise<void> {
  await pool.query(
    `UPDATE apps SET status = $2, updated_at = now() WHERE id = $1`,
    [appUuid, status],
  )
}

export async function listDeveloperApps(
  pool: DbPool,
  config: ServerConfig,
  developerUuid: string,
  input: { limit?: number; offset?: number; q?: string; status?: string },
): Promise<PaginatedAppsResult> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  const offset = Math.max(input.offset ?? 0, 0)
  const pattern = input.q?.trim() ? `%${input.q.trim()}%` : null

  const result = await pool.query<
    AppRow & { origin_count: string; bundle_count: string; namespace_count: string }
  >(
    `SELECT a.id, a.app_id, a.developer_uuid, a.name, a.type, a.status, a.client_secret_hash,
            a.created_at, a.updated_at,
            (SELECT COUNT(*)::text FROM app_origins o WHERE o.app_uuid = a.id) AS origin_count,
            (SELECT COUNT(*)::text FROM app_bundles b WHERE b.app_uuid = a.id) AS bundle_count,
            (SELECT COUNT(*)::text FROM namespaces n WHERE n.app_uuid = a.id) AS namespace_count
     FROM apps a
     WHERE a.developer_uuid = $1
       AND ($2::text IS NULL OR a.app_id ILIKE $2 OR a.name ILIKE $2 OR EXISTS (
         SELECT 1 FROM app_bundles b WHERE b.app_uuid = a.id AND b.bundle_id ILIKE $2
       ))
       AND ($3::text IS NULL OR a.status = $3)
     ORDER BY a.created_at DESC
     LIMIT $4 OFFSET $5`,
    [developerUuid, pattern, input.status ?? null, limit, offset],
  )

  const totalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM apps a
     WHERE a.developer_uuid = $1
       AND ($2::text IS NULL OR a.app_id ILIKE $2 OR a.name ILIKE $2 OR EXISTS (
         SELECT 1 FROM app_bundles b WHERE b.app_uuid = a.id AND b.bundle_id ILIKE $2
       ))
       AND ($3::text IS NULL OR a.status = $3)`,
    [developerUuid, pattern, input.status ?? null],
  )

  return {
    items: result.rows.map(
      (row): AdminAppSummary => ({
        appId: row.app_id,
        name: row.name,
        type: row.type,
        status: row.status,
        originCount: Number(row.origin_count),
        bundleCount: Number(row.bundle_count),
        namespaceCount: Number(row.namespace_count),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }),
    ),
    total: Number(totalResult.rows[0]?.count ?? 0),
    limit,
    offset,
  }
}

export async function getDeveloperApp(
  pool: DbPool,
  config: ServerConfig,
  developerUuid: string,
  appId: string,
): Promise<AdminAppDetail> {
  const app = await requireOwnedApp(pool, developerUuid, appId)
  return buildAdminAppDetail(pool, app, config)
}

export async function createDeveloperApp(
  pool: DbPool,
  config: ServerConfig,
  developerUuid: string,
  input: CreateDeveloperAppInput,
): Promise<AdminAppDetail> {
  await assertDeveloperAppQuota(pool, config, developerUuid)

  let appId = generatePublicAppId()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await findAppByPublicId(pool, appId)
    if (!existing) break
    appId = generatePublicAppId()
  }

  const result = await pool.query<AppRow>(
    `INSERT INTO apps (app_id, developer_uuid, name, type, status, client_secret_hash)
     VALUES ($1, $2, $3, $4, 'pending', NULL)
     RETURNING id, app_id, developer_uuid, name, type, status, client_secret_hash, created_at, updated_at`,
    [appId, developerUuid, input.name, input.type],
  )

  const app = result.rows[0]
  if (!app) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create application')
  }

  return buildAdminAppDetail(pool, app, config)
}

export async function updateDeveloperApp(
  pool: DbPool,
  config: ServerConfig,
  developerUuid: string,
  appId: string,
  input: UpdateDeveloperAppInput,
): Promise<AdminAppDetail> {
  const app = await requireOwnedApp(pool, developerUuid, appId)

  const result = await pool.query<AppRow>(
    `UPDATE apps
     SET name = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, app_id, developer_uuid, name, type, status, client_secret_hash, created_at, updated_at`,
    [app.id, input.name],
  )

  const updated = result.rows[0] ?? app
  return buildAdminAppDetail(pool, updated, config)
}

export async function archiveDeveloperApp(
  pool: DbPool,
  config: ServerConfig,
  developerUuid: string,
  appId: string,
): Promise<AdminAppDetail> {
  const app = await requireOwnedApp(pool, developerUuid, appId)

  const result = await pool.query<AppRow>(
    `UPDATE apps
     SET status = 'archived', updated_at = now()
     WHERE id = $1
     RETURNING id, app_id, developer_uuid, name, type, status, client_secret_hash, created_at, updated_at`,
    [app.id],
  )

  const updated = result.rows[0] ?? app
  return buildAdminAppDetail(pool, updated, config)
}

export async function addDeveloperAppOrigin(
  pool: DbPool,
  config: ServerConfig,
  developerUuid: string,
  appId: string,
  input: AddDeveloperAppOriginInput,
): Promise<AdminAppDetail> {
  const app = await requireOwnedApp(pool, developerUuid, appId)
  assertAppNotArchived(app)

  if (app.type !== 'web') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Origins can only be added to web applications')
  }

  const origin = normalizeOriginForRegistration(input.origin)

  try {
    await pool.query(
      `INSERT INTO app_origins (app_uuid, origin, verification_token, verified_at)
       VALUES ($1, $2, $3, NULL)`,
      [app.id, origin, generateVerificationToken()],
    )
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '23505') {
      throw new AppError(409, 'APP_ORIGIN_EXISTS', 'Origin is already registered for this application', {
        origin,
      })
    }

    throw error
  }

  if (app.status === 'pending') {
    await transitionAppStatus(pool, app.id, 'pending_verification')
  }

  await pool.query(`UPDATE apps SET updated_at = now() WHERE id = $1`, [app.id])

  const refreshed = await findAppByPublicId(pool, appId)
  return buildAdminAppDetail(pool, refreshed ?? app, config)
}

export async function deleteDeveloperAppOrigin(
  pool: DbPool,
  config: ServerConfig,
  developerUuid: string,
  appId: string,
  originRowId: string,
): Promise<AdminAppDetail> {
  const app = await requireOwnedApp(pool, developerUuid, appId)
  assertAppNotArchived(app)

  const result = await pool.query(`DELETE FROM app_origins WHERE id = $1 AND app_uuid = $2`, [
    originRowId,
    app.id,
  ])

  if (result.rowCount === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Origin not found for this application')
  }

  await pool.query(`UPDATE apps SET updated_at = now() WHERE id = $1`, [app.id])
  return buildAdminAppDetail(pool, app, config)
}

export async function verifyDeveloperAppOrigin(
  pool: DbPool,
  config: ServerConfig,
  developerUuid: string,
  appId: string,
  originRowId: string,
): Promise<{ verification: VerifyOriginResult; app: AdminAppDetail }> {
  await requireOwnedApp(pool, developerUuid, appId)
  const verification = await verifyAppOrigin(pool, config, appId, originRowId)
  const app = await findAppByPublicId(pool, appId)

  if (!app) {
    throw new AppError(404, 'NOT_FOUND', 'Application not found')
  }

  return {
    verification,
    app: await buildAdminAppDetail(pool, app, config),
  }
}

export async function addDeveloperAppBundle(
  pool: DbPool,
  config: ServerConfig,
  developerUuid: string,
  appId: string,
  input: AddDeveloperAppBundleInput,
): Promise<AdminAppDetail> {
  const app = await requireOwnedApp(pool, developerUuid, appId)

  if (app.type !== 'native') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Bundles can only be added to native applications')
  }

  const verifiedAt = config.apps.native.requireManualReview ? null : new Date()

  try {
    await pool.query(
      `INSERT INTO app_bundles (app_uuid, platform, bundle_id, verified_at)
       VALUES ($1, $2, $3, $4)`,
      [app.id, input.platform, input.bundleId, verifiedAt],
    )
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '23505') {
      throw new AppError(409, 'APP_BUNDLE_EXISTS', 'Bundle is already registered for this application', {
        platform: input.platform,
        bundleId: input.bundleId,
      })
    }

    throw error
  }

  if (app.status === 'pending' || app.status === 'active') {
    await transitionAppStatus(pool, app.id, 'pending_verification')
  }

  if (!config.apps.native.requireManualReview && verifiedAt) {
    await maybeActivateAppAfterVerification(pool, app.id)
  }

  await pool.query(`UPDATE apps SET updated_at = now() WHERE id = $1`, [app.id])

  const refreshed = await findAppByPublicId(pool, appId)
  return buildAdminAppDetail(pool, refreshed ?? app, config)
}

export async function rotateDeveloperAppSecret(
  pool: DbPool,
  config: ServerConfig,
  developerUuid: string,
  appId: string,
): Promise<RotateDeveloperAppSecretResult> {
  const app = await requireOwnedApp(pool, developerUuid, appId)

  if (app.type !== 'native') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Client secret rotation is only available for native apps')
  }

  const clientSecret = randomBytes(24).toString('hex')
  const clientSecretHash = hashClientSecret(clientSecret)

  const result = await pool.query<AppRow>(
    `UPDATE apps
     SET client_secret_hash = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, app_id, developer_uuid, name, type, status, client_secret_hash, created_at, updated_at`,
    [app.id, clientSecretHash],
  )

  const updated = result.rows[0] ?? app

  return {
    clientSecret,
    app: await buildAdminAppDetail(pool, updated, config),
  }
}
