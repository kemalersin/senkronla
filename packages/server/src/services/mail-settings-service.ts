import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import {
  mergeEffectiveMailConfig,
  mergeMailSettingsOverride,
  parseMailSettingsOverride,
  redactMailSettingsForResponse,
  type MailConfig,
  type MailSettingsOverride,
  mailSettingsOverrideSchema,
} from '../types/mail-settings.js'

const MAIL_SETTINGS_KEY = 'mail'

async function loadMailOverride(pool: DbPool): Promise<MailSettingsOverride | null> {
  const result = await pool.query<{ value: unknown }>(
    `SELECT value FROM operator_settings WHERE key = $1`,
    [MAIL_SETTINGS_KEY],
  )

  return parseMailSettingsOverride(result.rows[0]?.value)
}

export async function getEffectiveMailConfig(
  pool: DbPool,
  config: ServerConfig,
): Promise<MailConfig> {
  const override = await loadMailOverride(pool)
  return mergeEffectiveMailConfig(config.mail, override)
}

export async function getMailSettings(pool: DbPool, config: ServerConfig) {
  const override = await loadMailOverride(pool)
  const effective = mergeEffectiveMailConfig(config.mail, override)
  return redactMailSettingsForResponse(config.mail, override, effective)
}

export async function patchMailSettings(
  pool: DbPool,
  config: ServerConfig,
  patch: MailSettingsOverride,
): Promise<ReturnType<typeof getMailSettings>> {
  const sanitized = mailSettingsOverrideSchema.parse(patch)
  const existing = await loadMailOverride(pool)
  const merged = mergeMailSettingsOverride(existing, sanitized)

  if (!merged) {
    await pool.query(`DELETE FROM operator_settings WHERE key = $1`, [MAIL_SETTINGS_KEY])
  } else {
    await pool.query(
      `INSERT INTO operator_settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now()`,
      [MAIL_SETTINGS_KEY, JSON.stringify(merged)],
    )
  }

  return getMailSettings(pool, config)
}

export function isMailConfigured(mail: MailConfig): boolean {
  return Boolean(
    mail.enabled &&
      mail.from &&
      mail.webBaseUrl &&
      mail.smtp.host &&
      mail.smtp.user &&
      mail.smtp.password,
  )
}
