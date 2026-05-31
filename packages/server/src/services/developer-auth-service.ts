import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { signDeveloperJwt, verifyDeveloperJwt } from '../lib/developer-jwt.js'
import { isDeveloperPortalEnabled } from '../lib/developer-portal.js'
import { hashPassword, verifyPassword } from '../lib/password-hash.js'
import type { MailLocale } from '../types/mail-settings.js'
import { consumeDeveloperAuthToken } from './developer-auth-token-service.js'
import {
  sendDeveloperPasswordResetEmail,
  sendDeveloperVerificationEmail,
} from './developer-mail-service.js'
import { getEffectiveMailConfig, isMailConfigured } from './mail-settings-service.js'

export interface DeveloperRow {
  id: string
  email: string
  password_hash: string
  email_verified_at: Date | null
  disabled_at: Date | null
  session_version: number
  created_at: Date
}

export interface DeveloperProfile {
  id: string
  email: string
  emailVerified: boolean
  createdAt: string
}

export interface DeveloperAuthResult {
  token: string
  developer: DeveloperProfile
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function mapDeveloper(row: DeveloperRow): DeveloperProfile {
  return {
    id: row.id,
    email: row.email,
    emailVerified: Boolean(row.email_verified_at),
    createdAt: row.created_at.toISOString(),
  }
}

function requirePortalConfig(config: ServerConfig): { jwtSecret: string; sessionTtlHours: number } {
  if (!isDeveloperPortalEnabled(config)) {
    throw new AppError(503, 'DEVELOPER_PORTAL_DISABLED', 'Developer portal is not enabled')
  }

  const jwtSecret = config.apps.developerPortal.jwtSecret
  if (!jwtSecret) {
    throw new AppError(503, 'DEVELOPER_PORTAL_DISABLED', 'Developer portal JWT secret is not configured')
  }

  return {
    jwtSecret,
    sessionTtlHours: config.apps.developerPortal.sessionTtlHours,
  }
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid email address', {
      fields: [{ path: 'email', message: 'Invalid email address' }],
    })
  }

  return normalized
}

function assertPasswordStrength(password: string): void {
  if (password.length < 8) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 8 characters', {
      fields: [{ path: 'password', message: 'Password must be at least 8 characters' }],
    })
  }
}

async function findDeveloperByEmail(pool: DbPool, email: string): Promise<DeveloperRow | null> {
  const result = await pool.query<DeveloperRow>(
    `SELECT id, email, password_hash, email_verified_at, disabled_at, session_version, created_at
     FROM developers
     WHERE email = $1`,
    [email],
  )

  return result.rows[0] ?? null
}

async function findDeveloperById(pool: DbPool, developerUuid: string): Promise<DeveloperRow | null> {
  const result = await pool.query<DeveloperRow>(
    `SELECT id, email, password_hash, email_verified_at, disabled_at, session_version, created_at
     FROM developers
     WHERE id = $1`,
    [developerUuid],
  )

  return result.rows[0] ?? null
}

function issueToken(config: ServerConfig, developer: DeveloperRow): string {
  const { jwtSecret, sessionTtlHours } = requirePortalConfig(config)

  return signDeveloperJwt(
    jwtSecret,
    { sub: developer.id, ver: developer.session_version },
    sessionTtlHours * 3600,
  )
}

export async function registerDeveloper(
  pool: DbPool,
  config: ServerConfig,
  input: { email: string; password: string; locale?: MailLocale },
): Promise<DeveloperAuthResult> {
  requirePortalConfig(config)

  const email = normalizeEmail(input.email)
  const locale = input.locale ?? 'en'
  assertPasswordStrength(input.password)

  const passwordHash = await hashPassword(input.password)
  const emailVerifiedAt = config.apps.developerPortal.requireEmailVerification ? null : new Date()

  try {
    const result = await pool.query<DeveloperRow>(
      `INSERT INTO developers (email, password_hash, email_verified_at)
       VALUES ($1, $2, $3)
       RETURNING id, email, password_hash, email_verified_at, disabled_at, session_version, created_at`,
      [email, passwordHash, emailVerifiedAt],
    )

    const developer = result.rows[0]
    if (!developer) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create developer account')
    }

    if (config.apps.developerPortal.requireEmailVerification) {
      const mail = await getEffectiveMailConfig(pool, config)
      if (isMailConfigured(mail)) {
        try {
          await sendDeveloperVerificationEmail(pool, config, {
            developerUuid: developer.id,
            email: developer.email,
            locale,
          })
        } catch {
          // Account is created even if outbound mail fails; user can resend later.
        }
      }

      return {
        token: '',
        developer: mapDeveloper(developer),
      }
    }

    return {
      token: issueToken(config, developer),
      developer: mapDeveloper(developer),
    }
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '23505') {
      throw new AppError(409, 'DEVELOPER_EMAIL_EXISTS', 'Developer account already exists', { email })
    }

    throw error
  }
}

export async function loginDeveloper(
  pool: DbPool,
  config: ServerConfig,
  input: { email: string; password: string },
): Promise<DeveloperAuthResult> {
  requirePortalConfig(config)

  const email = normalizeEmail(input.email)
  const developer = await findDeveloperByEmail(pool, email)

  if (!developer || !(await verifyPassword(input.password, developer.password_hash))) {
    throw new AppError(401, 'DEVELOPER_INVALID_CREDENTIALS', 'Invalid email or password')
  }

  if (developer.disabled_at) {
    throw new AppError(403, 'DEVELOPER_ACCOUNT_DISABLED', 'Developer account is disabled')
  }

  if (config.apps.developerPortal.requireEmailVerification && !developer.email_verified_at) {
    throw new AppError(403, 'DEVELOPER_EMAIL_NOT_VERIFIED', 'Email address is not verified')
  }

  return {
    token: issueToken(config, developer),
    developer: mapDeveloper(developer),
  }
}

export async function logoutDeveloper(pool: DbPool, developerUuid: string): Promise<void> {
  const result = await pool.query(
    `UPDATE developers
     SET session_version = session_version + 1
     WHERE id = $1`,
    [developerUuid],
  )

  if (result.rowCount === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Developer account not found')
  }
}

export async function getDeveloperProfile(
  pool: DbPool,
  developerUuid: string,
): Promise<DeveloperProfile> {
  const developer = await findDeveloperById(pool, developerUuid)

  if (!developer) {
    throw new AppError(404, 'NOT_FOUND', 'Developer account not found')
  }

  return mapDeveloper(developer)
}

export async function changeDeveloperPassword(
  pool: DbPool,
  developerUuid: string,
  input: { currentPassword: string; newPassword: string },
): Promise<{ ok: true }> {
  const developer = await findDeveloperById(pool, developerUuid)

  if (!developer) {
    throw new AppError(404, 'NOT_FOUND', 'Developer account not found')
  }

  if (developer.disabled_at) {
    throw new AppError(403, 'DEVELOPER_ACCOUNT_DISABLED', 'Developer account is disabled')
  }

  if (!(await verifyPassword(input.currentPassword, developer.password_hash))) {
    throw new AppError(401, 'DEVELOPER_INVALID_CREDENTIALS', 'Current password is incorrect')
  }

  assertPasswordStrength(input.newPassword)

  const passwordHash = await hashPassword(input.newPassword)

  await pool.query(`UPDATE developers SET password_hash = $1 WHERE id = $2`, [
    passwordHash,
    developerUuid,
  ])

  return { ok: true }
}

export async function resolveDeveloperSession(
  pool: DbPool,
  config: ServerConfig,
  token: string,
): Promise<DeveloperRow> {
  const { jwtSecret } = requirePortalConfig(config)

  let payload
  try {
    payload = verifyDeveloperJwt(jwtSecret, token)
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Developer token is invalid or expired')
  }

  const developer = await findDeveloperById(pool, payload.sub)
  if (!developer) {
    throw new AppError(401, 'UNAUTHORIZED', 'Developer account not found')
  }

  if (developer.disabled_at) {
    throw new AppError(403, 'DEVELOPER_ACCOUNT_DISABLED', 'Developer account is disabled')
  }

  if (developer.session_version !== payload.ver) {
    throw new AppError(401, 'UNAUTHORIZED', 'Developer session has expired')
  }

  return developer
}

export async function verifyDeveloperEmail(
  pool: DbPool,
  config: ServerConfig,
  token: string,
): Promise<{ ok: true; developer: DeveloperProfile }> {
  requirePortalConfig(config)

  const { developerUuid } = await consumeDeveloperAuthToken(pool, 'email_verify', token)
  const developer = await findDeveloperById(pool, developerUuid)

  if (!developer) {
    throw new AppError(404, 'NOT_FOUND', 'Developer account not found')
  }

  if (developer.disabled_at) {
    throw new AppError(403, 'DEVELOPER_ACCOUNT_DISABLED', 'Developer account is disabled')
  }

  if (developer.email_verified_at) {
    return { ok: true, developer: mapDeveloper(developer) }
  }

  const result = await pool.query<DeveloperRow>(
    `UPDATE developers
     SET email_verified_at = now()
     WHERE id = $1
     RETURNING id, email, password_hash, email_verified_at, disabled_at, session_version, created_at`,
    [developerUuid],
  )

  const updated = result.rows[0]
  if (!updated) {
    throw new AppError(404, 'NOT_FOUND', 'Developer account not found')
  }

  return { ok: true, developer: mapDeveloper(updated) }
}

export async function resendDeveloperVerification(
  pool: DbPool,
  config: ServerConfig,
  input: { email: string; locale?: MailLocale },
): Promise<{ ok: true }> {
  requirePortalConfig(config)

  if (!config.apps.developerPortal.requireEmailVerification) {
    return { ok: true }
  }

  const email = normalizeEmail(input.email)
  const locale = input.locale ?? 'en'
  const developer = await findDeveloperByEmail(pool, email)

  if (
    !developer ||
    developer.disabled_at ||
    developer.email_verified_at ||
    !(await isMailConfigured(await getEffectiveMailConfig(pool, config)))
  ) {
    return { ok: true }
  }

  await sendDeveloperVerificationEmail(pool, config, {
    developerUuid: developer.id,
    email: developer.email,
    locale,
  })

  return { ok: true }
}

export async function requestDeveloperPasswordReset(
  pool: DbPool,
  config: ServerConfig,
  input: { email: string; locale?: MailLocale },
): Promise<{ ok: true }> {
  requirePortalConfig(config)

  const email = normalizeEmail(input.email)
  const locale = input.locale ?? 'en'
  const developer = await findDeveloperByEmail(pool, email)

  if (
    !developer ||
    developer.disabled_at ||
    !(await isMailConfigured(await getEffectiveMailConfig(pool, config)))
  ) {
    return { ok: true }
  }

  await sendDeveloperPasswordResetEmail(pool, config, {
    developerUuid: developer.id,
    email: developer.email,
    locale,
  })

  return { ok: true }
}

export async function resetDeveloperPassword(
  pool: DbPool,
  config: ServerConfig,
  input: { token: string; newPassword: string },
): Promise<{ ok: true }> {
  requirePortalConfig(config)

  assertPasswordStrength(input.newPassword)
  const { developerUuid } = await consumeDeveloperAuthToken(pool, 'password_reset', input.token)
  const developer = await findDeveloperById(pool, developerUuid)

  if (!developer) {
    throw new AppError(404, 'NOT_FOUND', 'Developer account not found')
  }

  if (developer.disabled_at) {
    throw new AppError(403, 'DEVELOPER_ACCOUNT_DISABLED', 'Developer account is disabled')
  }

  const passwordHash = await hashPassword(input.newPassword)

  await pool.query(
    `UPDATE developers
     SET password_hash = $1, session_version = session_version + 1
     WHERE id = $2`,
    [passwordHash, developerUuid],
  )

  return { ok: true }
}
