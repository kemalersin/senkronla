import type { NativePlatform } from '@senkronla/protocol'
import { createHash } from 'node:crypto'
import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { findAppByPublicId } from './app-registry-service.js'
import {
  buildVerificationInstructions,
  ensureLocalhostOriginsVerified,
  generateVerificationToken,
  isLocalhostOriginVerificationExempt,
  maybeActivateAppAfterVerification,
  normalizeOriginForRegistration,
  verifyAppOrigin,
  type VerifyOriginResult,
} from './origin-verification-service.js'
import type { AppBundleRow, AppOriginRow, AppRow } from '../types/db.js'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

import { APP_ID_PATTERN, APP_ID_VALIDATION_MESSAGE } from '../lib/app-id.js'
const APP_STATUSES = ['pending', 'pending_verification', 'active', 'suspended', 'archived'] as const

export type AppStatus = (typeof APP_STATUSES)[number]

export interface PaginationInput {
  limit?: number
  offset?: number
}

export interface PaginatedAppsResult {
  items: AdminAppSummary[]
  total: number
  limit: number
  offset: number
}

export interface AdminAppOrigin {
  id: string
  origin: string
  verifiedAt: string | null
  createdAt: string
  verification?: OriginVerificationInstructions | null
}

export interface OriginVerificationInstructions {
  dnsHost: string
  dnsTxt: string
  wellKnownUrl: string
}

export interface AdminAppBundle {
  id: string
  platform: NativePlatform
  bundleId: string
  verifiedAt: string | null
  createdAt: string
}

export interface AdminAppSummary {
  appId: string
  name: string
  type: 'web' | 'native'
  status: string
  originCount: number
  bundleCount: number
  namespaceCount: number
  developerEmail?: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminAppDetail extends AdminAppSummary {
  origins: AdminAppOrigin[]
  bundles: AdminAppBundle[]
  hasClientSecret: boolean
}

export interface CreateAdminAppInput {
  appId: string
  name: string
  type: 'web' | 'native'
  status?: AppStatus
  origins?: string[]
  bundleIds?: {
    ios?: string
    android?: string
    desktop?: string
  }
  clientSecret?: string
}

export interface UpdateAdminAppInput {
  name?: string
  status?: AppStatus
}

export interface AddAdminAppOriginInput {
  origin: string
  verified?: boolean
}

export interface AddAdminAppBundleInput {
  platform: NativePlatform
  bundleId: string
  verified?: boolean
}

function hashClientSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function resolveLimit(limit?: number): number {
  if (!limit) return DEFAULT_LIMIT
  return Math.min(Math.max(limit, 1), MAX_LIMIT)
}

function resolveOffset(offset?: number): number {
  if (!offset) return 0
  return Math.max(offset, 0)
}

function assertAppId(appId: string): void {
  if (!APP_ID_PATTERN.test(appId)) {
    throw new AppError(400, 'VALIDATION_ERROR', APP_ID_VALIDATION_MESSAGE, {
      fields: [{ path: 'appId', message: APP_ID_VALIDATION_MESSAGE }],
    })
  }
}

function assertStatus(status: string): asserts status is AppStatus {
  if (!APP_STATUSES.includes(status as AppStatus)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid app status', {
      fields: [{ path: 'status', message: `Must be one of: ${APP_STATUSES.join(', ')}` }],
    })
  }
}

function normalizeOriginInput(origin: string): string {
  return normalizeOriginForRegistration(origin)
}

function mapOrigin(row: AppOriginRow, appId: string, config: ServerConfig): AdminAppOrigin {
  const verificationExempt = isLocalhostOriginVerificationExempt(config, row.origin)

  return {
    id: row.id,
    origin: row.origin,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    verification:
      row.verified_at || verificationExempt
        ? null
        : buildVerificationInstructions(row.origin, appId, row.verification_token, config),
  }
}

function mapBundle(row: AppBundleRow): AdminAppBundle {
  return {
    id: row.id,
    platform: row.platform,
    bundleId: row.bundle_id,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  }
}

async function requireAppRow(pool: DbPool, appId: string): Promise<AppRow> {
  const app = await findAppByPublicId(pool, appId)
  if (!app) {
    throw new AppError(404, 'NOT_FOUND', 'Application not found')
  }

  return app
}

export function assertAppNotArchived(app: AppRow): void {
  if (app.status === 'archived') {
    throw new AppError(403, 'APP_ARCHIVED', 'Archived applications cannot be modified')
  }
}

export async function buildAdminAppDetail(
  pool: DbPool,
  app: AppRow,
  config: ServerConfig,
): Promise<AdminAppDetail> {
  if (await ensureLocalhostOriginsVerified(pool, config, app.id)) {
    await maybeActivateAppAfterVerification(pool, app.id)
    const refreshed = await findAppByPublicId(pool, app.app_id)
    if (refreshed) {
      app = refreshed
    }
  }

  const [origins, bundles, counts] = await Promise.all([
    pool.query<AppOriginRow>(
      `SELECT id, app_uuid, origin, verification_token, verified_at, created_at
       FROM app_origins
       WHERE app_uuid = $1
       ORDER BY created_at ASC`,
      [app.id],
    ),
    pool.query<AppBundleRow>(
      `SELECT id, app_uuid, platform, bundle_id, verified_at, created_at
       FROM app_bundles
       WHERE app_uuid = $1
       ORDER BY created_at ASC`,
      [app.id],
    ),
    pool.query<{ namespace_count: string }>(
      `SELECT COUNT(*)::text AS namespace_count
       FROM namespaces
       WHERE app_uuid = $1`,
      [app.id],
    ),
  ])

  return {
    appId: app.app_id,
    name: app.name,
    type: app.type,
    status: app.status,
    originCount: origins.rowCount ?? 0,
    bundleCount: bundles.rowCount ?? 0,
    namespaceCount: Number(counts.rows[0]?.namespace_count ?? 0),
    createdAt: app.created_at.toISOString(),
    updatedAt: app.updated_at.toISOString(),
    origins: origins.rows.map((row) => mapOrigin(row, app.app_id, config)),
    bundles: bundles.rows.map(mapBundle),
    hasClientSecret: Boolean(app.client_secret_hash),
  }
}

export async function listAdminApps(
  pool: DbPool,
  input: PaginationInput & { q?: string; status?: string; developerId?: string },
): Promise<PaginatedAppsResult> {
  const limit = resolveLimit(input.limit)
  const offset = resolveOffset(input.offset)
  const pattern = input.q?.trim() ? `%${input.q.trim()}%` : null
  const developerId = input.developerId?.trim() || null

  const result = await pool.query<
    AppRow & { origin_count: string; bundle_count: string; namespace_count: string; developer_email: string | null }
  >(
    `SELECT a.id, a.app_id, a.developer_uuid, a.name, a.type, a.status, a.client_secret_hash,
            a.created_at, a.updated_at,
            (SELECT COUNT(*)::text FROM app_origins o WHERE o.app_uuid = a.id) AS origin_count,
            (SELECT COUNT(*)::text FROM app_bundles b WHERE b.app_uuid = a.id) AS bundle_count,
            (SELECT COUNT(*)::text FROM namespaces n WHERE n.app_uuid = a.id) AS namespace_count,
            d.email AS developer_email
     FROM apps a
     LEFT JOIN developers d ON d.id = a.developer_uuid
     WHERE ($1::text IS NULL OR a.app_id ILIKE $1 OR a.name ILIKE $1 OR COALESCE(d.email, '') ILIKE $1 OR EXISTS (
         SELECT 1 FROM app_bundles b WHERE b.app_uuid = a.id AND b.bundle_id ILIKE $1
       ))
       AND ($2::text IS NULL OR a.status = $2)
       AND ($5::uuid IS NULL OR a.developer_uuid = $5)
     ORDER BY a.created_at DESC
     LIMIT $3 OFFSET $4`,
    [pattern, input.status ?? null, limit, offset, developerId],
  )

  const totalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM apps a
     LEFT JOIN developers d ON d.id = a.developer_uuid
     WHERE ($1::text IS NULL OR a.app_id ILIKE $1 OR a.name ILIKE $1 OR COALESCE(d.email, '') ILIKE $1 OR EXISTS (
         SELECT 1 FROM app_bundles b WHERE b.app_uuid = a.id AND b.bundle_id ILIKE $1
       ))
       AND ($2::text IS NULL OR a.status = $2)
       AND ($3::uuid IS NULL OR a.developer_uuid = $3)`,
    [pattern, input.status ?? null, developerId],
  )

  return {
    items: result.rows.map((row) => ({
      appId: row.app_id,
      name: row.name,
      type: row.type,
      status: row.status,
      originCount: Number(row.origin_count),
      bundleCount: Number(row.bundle_count),
      namespaceCount: Number(row.namespace_count),
      developerEmail: row.developer_email,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    })),
    total: Number(totalResult.rows[0]?.count ?? 0),
    limit,
    offset,
  }
}

export async function getAdminApp(
  pool: DbPool,
  config: ServerConfig,
  appId: string,
): Promise<AdminAppDetail> {
  const app = await requireAppRow(pool, appId)
  return buildAdminAppDetail(pool, app, config)
}

export async function createAdminApp(
  pool: DbPool,
  config: ServerConfig,
  input: CreateAdminAppInput,
): Promise<AdminAppDetail> {
  assertAppId(input.appId)

  const status = input.status ?? 'active'
  assertStatus(status)

  const existing = await findAppByPublicId(pool, input.appId)
  if (existing) {
    throw new AppError(409, 'VALIDATION_ERROR', 'Application already exists', { appId: input.appId })
  }

  const clientSecretHash = input.clientSecret ? hashClientSecret(input.clientSecret) : null
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const appResult = await client.query<AppRow>(
      `INSERT INTO apps (app_id, name, type, status, client_secret_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, app_id, developer_uuid, name, type, status, client_secret_hash, created_at, updated_at`,
      [input.appId, input.name, input.type, status, clientSecretHash],
    )

    const app = appResult.rows[0]
    if (!app) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create application')
    }

    for (const rawOrigin of input.origins ?? []) {
      const origin = normalizeOriginInput(rawOrigin)
      await client.query(
        `INSERT INTO app_origins (app_uuid, origin, verification_token, verified_at)
         VALUES ($1, $2, $3, now())`,
        [app.id, origin, generateVerificationToken()],
      )
    }

    if (input.bundleIds?.ios) {
      await client.query(
        `INSERT INTO app_bundles (app_uuid, platform, bundle_id, verified_at)
         VALUES ($1, 'ios', $2, now())`,
        [app.id, input.bundleIds.ios],
      )
    }

    if (input.bundleIds?.android) {
      await client.query(
        `INSERT INTO app_bundles (app_uuid, platform, bundle_id, verified_at)
         VALUES ($1, 'android', $2, now())`,
        [app.id, input.bundleIds.android],
      )
    }

    if (input.bundleIds?.desktop) {
      await client.query(
        `INSERT INTO app_bundles (app_uuid, platform, bundle_id, verified_at)
         VALUES ($1, 'desktop', $2, now())`,
        [app.id, input.bundleIds.desktop],
      )
    }

    await client.query('COMMIT')
    await maybeActivateAppAfterVerification(pool, app.id)
    const refreshed = await findAppByPublicId(pool, input.appId)
    return buildAdminAppDetail(pool, refreshed ?? app, config)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function updateAdminApp(
  pool: DbPool,
  config: ServerConfig,
  appId: string,
  input: UpdateAdminAppInput,
): Promise<AdminAppDetail> {
  const app = await requireAppRow(pool, appId)

  if (input.status !== undefined) {
    assertStatus(input.status)
  }

  if (input.name === undefined && input.status === undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one of name or status is required')
  }

  const result = await pool.query<AppRow>(
    `UPDATE apps
     SET name = COALESCE($2, name),
         status = COALESCE($3, status),
         updated_at = now()
     WHERE id = $1
     RETURNING id, app_id, developer_uuid, name, type, status, client_secret_hash, created_at, updated_at`,
    [app.id, input.name ?? null, input.status ?? null],
  )

  const updated = result.rows[0] ?? app
  return buildAdminAppDetail(pool, updated, config)
}

export async function addAdminAppOrigin(
  pool: DbPool,
  config: ServerConfig,
  appId: string,
  input: AddAdminAppOriginInput,
): Promise<AdminAppDetail> {
  const app = await requireAppRow(pool, appId)
  assertAppNotArchived(app)
  const origin = normalizeOriginInput(input.origin)

  try {
    await pool.query(
      `INSERT INTO app_origins (app_uuid, origin, verification_token, verified_at)
       VALUES ($1, $2, $3, now())`,
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

  await pool.query(`UPDATE apps SET updated_at = now() WHERE id = $1`, [app.id])
  await maybeActivateAppAfterVerification(pool, app.id)

  const refreshed = await findAppByPublicId(pool, appId)
  return buildAdminAppDetail(pool, refreshed ?? app, config)
}

export async function addAdminAppBundle(
  pool: DbPool,
  config: ServerConfig,
  appId: string,
  input: AddAdminAppBundleInput,
): Promise<AdminAppDetail> {
  const app = await requireAppRow(pool, appId)

  try {
    await pool.query(
      `INSERT INTO app_bundles (app_uuid, platform, bundle_id, verified_at)
       VALUES ($1, $2, $3, now())`,
      [app.id, input.platform, input.bundleId],
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

  await pool.query(`UPDATE apps SET updated_at = now() WHERE id = $1`, [app.id])
  await maybeActivateAppAfterVerification(pool, app.id)

  const refreshed = await findAppByPublicId(pool, appId)
  return buildAdminAppDetail(pool, refreshed ?? app, config)
}

export async function approveAdminAppBundle(
  pool: DbPool,
  config: ServerConfig,
  appId: string,
  bundleRowId: string,
): Promise<AdminAppDetail> {
  const app = await requireAppRow(pool, appId)

  const result = await pool.query(
    `UPDATE app_bundles
     SET verified_at = now()
     WHERE id = $1 AND app_uuid = $2`,
    [bundleRowId, app.id],
  )

  if (result.rowCount === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Bundle not found for this application')
  }

  await pool.query(`UPDATE apps SET updated_at = now() WHERE id = $1`, [app.id])
  await maybeActivateAppAfterVerification(pool, app.id)

  const refreshed = await findAppByPublicId(pool, appId)
  return buildAdminAppDetail(pool, refreshed ?? app, config)
}

export async function archiveAdminApp(
  pool: DbPool,
  config: ServerConfig,
  appId: string,
): Promise<AdminAppDetail> {
  return updateAdminApp(pool, config, appId, { status: 'archived' })
}

export async function deleteAdminAppOrigin(
  pool: DbPool,
  config: ServerConfig,
  appId: string,
  originRowId: string,
): Promise<AdminAppDetail> {
  const app = await requireAppRow(pool, appId)
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

export interface VerifyAdminAppOriginResult {
  verification: VerifyOriginResult
  app: AdminAppDetail
}

export async function verifyAdminAppOrigin(
  pool: DbPool,
  config: ServerConfig,
  appId: string,
  originRowId: string,
): Promise<VerifyAdminAppOriginResult> {
  const verification = await verifyAppOrigin(pool, config, appId, originRowId)
  const app = await requireAppRow(pool, appId)

  return {
    verification,
    app: await buildAdminAppDetail(pool, app, config),
  }
}
