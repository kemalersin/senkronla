import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { isDeveloperPortalEnabled } from '../lib/developer-portal.js'
import { createDeveloperAuthToken } from './developer-auth-token-service.js'
import { isDeveloperAuthMailPerDeveloperLimitReached } from './developer-auth-mail-rate-limit.js'
import { getEffectiveMailConfig, isMailConfigured } from './mail-settings-service.js'
import { sendDeveloperMail, type DeveloperMailKind } from './mail-service.js'
import type { MailConfig, MailLocale } from '../types/mail-settings.js'

function dispatchDeveloperMail(
  mail: MailConfig,
  input: {
    to: string
    locale: MailLocale
    kind: DeveloperMailKind
    token: string
  },
): void {
  void sendDeveloperMail(mail, input).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[senkronla] Failed to send developer ${input.kind} mail to ${input.to}: ${message}`,
    )
  })
}

async function sendDeveloperAuthMail(
  pool: DbPool,
  config: ServerConfig,
  input: {
    developerUuid: string
    email: string
    locale: MailLocale
    kind: DeveloperMailKind
    ttlSeconds: number
  },
): Promise<void> {
  if (!isDeveloperPortalEnabled(config)) {
    throw new AppError(503, 'DEVELOPER_PORTAL_DISABLED', 'Developer portal is not enabled')
  }

  const mail = await getEffectiveMailConfig(pool, config)

  if (!isMailConfigured(mail)) {
    throw new AppError(503, 'MAIL_NOT_CONFIGURED', 'Outbound mail is not configured')
  }

  const purpose = input.kind === 'email_verify' ? 'email_verify' : 'password_reset'
  if (
    await isDeveloperAuthMailPerDeveloperLimitReached(
      pool,
      config,
      input.developerUuid,
      purpose,
    )
  ) {
    return
  }

  const token = await createDeveloperAuthToken(pool, {
    developerUuid: input.developerUuid,
    purpose,
    locale: input.locale,
    ttlSeconds: input.ttlSeconds,
  })

  dispatchDeveloperMail(mail, {
    to: input.email,
    locale: input.locale,
    kind: input.kind,
    token,
  })
}

export async function sendDeveloperVerificationEmail(
  pool: DbPool,
  config: ServerConfig,
  input: { developerUuid: string; email: string; locale: MailLocale },
): Promise<void> {
  await sendDeveloperAuthMail(pool, config, {
    ...input,
    kind: 'email_verify',
    ttlSeconds: config.apps.developerPortal.emailVerifyTtlSeconds,
  })
}

export async function sendDeveloperPasswordResetEmail(
  pool: DbPool,
  config: ServerConfig,
  input: { developerUuid: string; email: string; locale: MailLocale },
): Promise<void> {
  await sendDeveloperAuthMail(pool, config, {
    ...input,
    kind: 'password_reset',
    ttlSeconds: config.apps.developerPortal.passwordResetTtlSeconds,
  })
}
