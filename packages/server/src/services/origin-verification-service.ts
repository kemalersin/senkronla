import { randomBytes } from 'node:crypto'
import { resolveTxt } from 'node:dns/promises'
import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { isLocalhostOrigin, normalizeOrigin } from '../lib/app-origin.js'
import type { AppOriginRow, AppRow } from '../types/db.js'
import { findAppByPublicId } from './app-registry-service.js'

export interface OriginVerificationInstructions {
  dnsHost: string
  dnsTxt: string
  wellKnownUrl: string
}

export type OriginVerificationMethod = 'dns' | 'https' | 'localhost'

export interface VerifyOriginResult {
  method: OriginVerificationMethod
  verifiedAt: string
}

export function generateVerificationToken(): string {
  return randomBytes(16).toString('hex')
}

export function isLocalhostOriginVerificationExempt(
  config: ServerConfig,
  origin: string,
): boolean {
  return config.apps.allowLocalhostOrigins && isLocalhostOrigin(origin)
}

/** Backfill verified_at for localhost origins when dev exemption is enabled. */
export async function ensureLocalhostOriginsVerified(
  pool: DbPool,
  config: ServerConfig,
  appUuid: string,
): Promise<boolean> {
  if (!config.apps.allowLocalhostOrigins) {
    return false
  }

  const pending = await pool.query<Pick<AppOriginRow, 'id' | 'origin'>>(
    `SELECT id, origin
     FROM app_origins
     WHERE app_uuid = $1 AND verified_at IS NULL`,
    [appUuid],
  )

  const verifiedAt = new Date()
  let updated = false

  for (const row of pending.rows) {
    if (!isLocalhostOrigin(row.origin)) {
      continue
    }

    await pool.query(`UPDATE app_origins SET verified_at = $1 WHERE id = $2`, [verifiedAt, row.id])
    updated = true
  }

  return updated
}

export function buildVerificationInstructions(
  origin: string,
  appId: string,
  token: string,
  config: ServerConfig,
): OriginVerificationInstructions {
  const hostname = new URL(origin).hostname
  const prefix = config.apps.verification.dnsRecordPrefix
  const wellKnownPath = config.apps.verification.wellKnownPath
  const txtValue = `esr_verify=${appId}:${token}`

  return {
    dnsHost: `${prefix}.${hostname}`,
    dnsTxt: txtValue,
    wellKnownUrl: `${origin.replace(/\/$/, '')}${wellKnownPath}`,
  }
}

async function verifyDnsTxt(
  origin: string,
  appId: string,
  token: string,
  config: ServerConfig,
): Promise<boolean> {
  const instructions = buildVerificationInstructions(origin, appId, token, config)

  try {
    const records = await resolveTxt(instructions.dnsHost)
    const flat = records.map((parts) => parts.join(''))

    return flat.some((record) => record.trim() === instructions.dnsTxt)
  } catch {
    return false
  }
}

async function verifyHttpsWellKnown(
  origin: string,
  appId: string,
  token: string,
  config: ServerConfig,
): Promise<boolean> {
  const instructions = buildVerificationInstructions(origin, appId, token, config)
  const timeoutMs = config.apps.verification.fetchTimeoutSeconds * 1000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(instructions.wellKnownUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })

    if (!response.ok) {
      return false
    }

    const body = (await response.json()) as { appId?: string; token?: string }
    return body.appId === appId && body.token === token
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function loadOriginRow(
  pool: DbPool,
  appUuid: string,
  originRowId: string,
): Promise<AppOriginRow> {
  const result = await pool.query<AppOriginRow>(
    `SELECT id, app_uuid, origin, verification_token, verified_at, created_at
     FROM app_origins
     WHERE id = $1 AND app_uuid = $2`,
    [originRowId, appUuid],
  )

  const row = result.rows[0]
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Origin not found for this application')
  }

  return row
}

async function maybeActivateApp(pool: DbPool, app: AppRow): Promise<void> {
  if (app.status !== 'pending_verification' && app.status !== 'pending') {
    return
  }

  if (app.type === 'web') {
    const pendingOrigins = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM app_origins
       WHERE app_uuid = $1 AND verified_at IS NULL`,
      [app.id],
    )

    if (Number(pendingOrigins.rows[0]?.count ?? 0) > 0) {
      return
    }
  }

  if (app.type === 'native') {
    const pendingBundles = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM app_bundles
       WHERE app_uuid = $1 AND verified_at IS NULL`,
      [app.id],
    )

    if (Number(pendingBundles.rows[0]?.count ?? 0) > 0) {
      return
    }
  }

  await pool.query(
    `UPDATE apps SET status = 'active', updated_at = now()
     WHERE id = $1 AND status IN ('pending', 'pending_verification')`,
    [app.id],
  )
}

export async function maybeActivateAppAfterVerification(pool: DbPool, appUuid: string): Promise<void> {
  const result = await pool.query<AppRow>(
    `SELECT id, app_id, developer_uuid, name, type, status, client_secret_hash, created_at, updated_at
     FROM apps
     WHERE id = $1`,
    [appUuid],
  )

  const app = result.rows[0]
  if (!app) {
    return
  }

  await maybeActivateApp(pool, app)
}

export async function verifyAppOrigin(
  pool: DbPool,
  config: ServerConfig,
  appId: string,
  originRowId: string,
): Promise<VerifyOriginResult> {
  const app = await findAppByPublicId(pool, appId)
  if (!app) {
    throw new AppError(404, 'NOT_FOUND', 'Application not found')
  }

  const originRow = await loadOriginRow(pool, app.id, originRowId)

  if (originRow.verified_at) {
    return {
      method: 'dns',
      verifiedAt: originRow.verified_at.toISOString(),
    }
  }

  if (isLocalhostOriginVerificationExempt(config, originRow.origin)) {
    const verifiedAt = new Date()
    await pool.query(
      `UPDATE app_origins SET verified_at = $1 WHERE id = $2`,
      [verifiedAt, originRow.id],
    )
    await pool.query(`UPDATE apps SET updated_at = now() WHERE id = $1`, [app.id])
    await maybeActivateApp(pool, app)

    return {
      method: 'localhost',
      verifiedAt: verifiedAt.toISOString(),
    }
  }

  const dnsOk = await verifyDnsTxt(originRow.origin, appId, originRow.verification_token, config)
  const httpsOk = dnsOk
    ? false
    : await verifyHttpsWellKnown(originRow.origin, appId, originRow.verification_token, config)

  if (!dnsOk && !httpsOk) {
    throw new AppError(422, 'APP_ORIGIN_VERIFICATION_FAILED', 'Origin verification failed', {
      origin: originRow.origin,
      instructions: buildVerificationInstructions(
        originRow.origin,
        appId,
        originRow.verification_token,
        config,
      ),
    })
  }

  const verifiedAt = new Date()
  await pool.query(
    `UPDATE app_origins SET verified_at = $1 WHERE id = $2`,
    [verifiedAt, originRow.id],
  )
  await pool.query(`UPDATE apps SET updated_at = now() WHERE id = $1`, [app.id])
  await maybeActivateApp(pool, app)

  return {
    method: dnsOk ? 'dns' : 'https',
    verifiedAt: verifiedAt.toISOString(),
  }
}

export function normalizeOriginForRegistration(origin: string): string {
  try {
    return normalizeOrigin(origin)
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'origin must be a valid URL origin', {
      fields: [{ path: 'origin', message: 'Invalid origin' }],
    })
  }
}
