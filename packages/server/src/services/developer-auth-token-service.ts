import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { generateAuthToken, hashAuthToken, verifyAuthTokenHash } from '../lib/auth-token.js'
import type { MailLocale } from '../types/mail-settings.js'

export type DeveloperAuthTokenPurpose = 'email_verify' | 'password_reset'

interface DeveloperAuthTokenRow {
  id: string
  developer_uuid: string
  purpose: DeveloperAuthTokenPurpose
  token_hash: string
  locale: MailLocale
  expires_at: Date
  consumed_at: Date | null
}

export async function invalidateDeveloperAuthTokens(
  pool: DbPool,
  developerUuid: string,
  purpose: DeveloperAuthTokenPurpose,
): Promise<void> {
  await pool.query(
    `UPDATE developer_auth_tokens
     SET consumed_at = now()
     WHERE developer_uuid = $1
       AND purpose = $2
       AND consumed_at IS NULL`,
    [developerUuid, purpose],
  )
}

export async function createDeveloperAuthToken(
  pool: DbPool,
  input: {
    developerUuid: string
    purpose: DeveloperAuthTokenPurpose
    locale: MailLocale
    ttlSeconds: number
  },
): Promise<string> {
  await invalidateDeveloperAuthTokens(pool, input.developerUuid, input.purpose)

  const token = generateAuthToken()
  const tokenHash = hashAuthToken(token)
  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000)

  await pool.query(
    `INSERT INTO developer_auth_tokens (developer_uuid, purpose, token_hash, locale, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.developerUuid, input.purpose, tokenHash, input.locale, expiresAt],
  )

  return token
}

export async function consumeDeveloperAuthToken(
  pool: DbPool,
  purpose: DeveloperAuthTokenPurpose,
  token: string,
): Promise<{ developerUuid: string; locale: MailLocale }> {
  const tokenHash = hashAuthToken(token)

  const result = await pool.query<DeveloperAuthTokenRow>(
    `SELECT id, developer_uuid, purpose, token_hash, locale, expires_at, consumed_at
     FROM developer_auth_tokens
     WHERE purpose = $1
       AND token_hash = $2
       AND consumed_at IS NULL
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [purpose, tokenHash],
  )

  const row = result.rows[0]

  if (!row || !verifyAuthTokenHash(token, row.token_hash)) {
    throw new AppError(400, 'INVALID_TOKEN', 'Token is invalid or expired')
  }

  await pool.query(`UPDATE developer_auth_tokens SET consumed_at = now() WHERE id = $1`, [row.id])

  return {
    developerUuid: row.developer_uuid,
    locale: row.locale,
  }
}
