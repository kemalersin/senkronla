import { z } from 'zod'

export const mailLocaleSchema = z.enum(['en', 'tr'])
export type MailLocale = z.infer<typeof mailLocaleSchema>

export const mailSmtpConfigSchema = z.object({
  host: z.string().default(''),
  port: z.coerce.number().int().positive().default(587),
  secure: z.coerce.boolean().default(false),
  user: z.string().default(''),
  password: z.string().default(''),
})

export type MailSmtpConfig = z.infer<typeof mailSmtpConfigSchema>

export const mailConfigSchema = z.object({
  enabled: z.coerce.boolean().default(false),
  from: z.string().default(''),
  fromName: z.string().default('Senkronla'),
  webBaseUrl: z.string().url().default('http://localhost:3000'),
  smtp: mailSmtpConfigSchema.default({}),
})

export type MailConfig = z.infer<typeof mailConfigSchema>

export const mailSmtpOverrideSchema = z
  .object({
    host: z.string().nullable().optional(),
    port: z.coerce.number().int().positive().nullable().optional(),
    secure: z.boolean().nullable().optional(),
    user: z.string().nullable().optional(),
    password: z.string().nullable().optional(),
  })
  .strict()

export const mailSettingsOverrideSchema = z
  .object({
    enabled: z.boolean().nullable().optional(),
    from: z.string().nullable().optional(),
    fromName: z.string().nullable().optional(),
    webBaseUrl: z.string().url().nullable().optional(),
    smtp: mailSmtpOverrideSchema.nullable().optional(),
  })
  .strict()

export type MailSettingsOverride = z.infer<typeof mailSettingsOverrideSchema>

export const REDACTED_SMTP_PASSWORD = '********'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseMailSettingsOverride(value: unknown): MailSettingsOverride | null {
  if (value === null || value === undefined) {
    return null
  }

  if (!isPlainObject(value)) {
    return null
  }

  return mailSettingsOverrideSchema.parse(value)
}

export function mergeMailSettingsOverride(
  existing: MailSettingsOverride | null,
  patch: MailSettingsOverride,
): MailSettingsOverride | null {
  const base = existing ?? {}
  const merged: MailSettingsOverride = { ...base }

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue
    }

    if (key === 'smtp') {
      if (value === null) {
        merged.smtp = null
        continue
      }

      const currentSmtp = merged.smtp && merged.smtp !== null ? merged.smtp : {}
      const nextSmtp = { ...currentSmtp }

      for (const [smtpKey, smtpValue] of Object.entries(value)) {
        if (smtpValue === undefined) {
          continue
        }

        ;(nextSmtp as Record<string, unknown>)[smtpKey] = smtpValue
      }

      merged.smtp = nextSmtp
      continue
    }

    ;(merged as Record<string, unknown>)[key] = value
  }

  const hasValues = Object.values(merged).some((item) => item !== undefined)
  return hasValues ? mailSettingsOverrideSchema.parse(merged) : null
}

export function mergeEffectiveMailConfig(
  configMail: MailConfig,
  override: MailSettingsOverride | null,
): MailConfig {
  if (!override) {
    return configMail
  }

  const smtpOverride = override.smtp
  const smtp: MailSmtpConfig = { ...configMail.smtp }

  if (smtpOverride === null) {
    // explicit clear — keep config defaults only
  } else if (smtpOverride) {
    for (const [key, value] of Object.entries(smtpOverride)) {
      if (value === null || value === undefined) {
        continue
      }

      ;(smtp as Record<string, unknown>)[key] = value
    }
  }

  return mailConfigSchema.parse({
    enabled: override.enabled ?? configMail.enabled,
    from: override.from ?? configMail.from,
    fromName: override.fromName ?? configMail.fromName,
    webBaseUrl: override.webBaseUrl ?? configMail.webBaseUrl,
    smtp,
  })
}

export function redactMailSettingsForResponse(
  configMail: MailConfig,
  override: MailSettingsOverride | null,
  effective: MailConfig,
) {
  const smtpPasswordConfigured = Boolean(
    (override?.smtp && override.smtp !== null && override.smtp.password) ||
      configMail.smtp.password,
  )

  return {
    config: {
      enabled: configMail.enabled,
      from: configMail.from,
      fromName: configMail.fromName,
      webBaseUrl: configMail.webBaseUrl,
      smtp: {
        host: configMail.smtp.host,
        port: configMail.smtp.port,
        secure: configMail.smtp.secure,
        user: configMail.smtp.user,
        passwordConfigured: Boolean(configMail.smtp.password),
      },
    },
    overrides: override,
    effective: {
      enabled: effective.enabled,
      from: effective.from,
      fromName: effective.fromName,
      webBaseUrl: effective.webBaseUrl,
      smtp: {
        host: effective.smtp.host,
        port: effective.smtp.port,
        secure: effective.smtp.secure,
        user: effective.smtp.user,
        passwordConfigured: smtpPasswordConfigured,
      },
    },
  }
}
