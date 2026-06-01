import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { deepMerge, interpolateEnv } from './merge.js'
import { serverConfigSchema, type RawConfig, type ServerConfig } from './schema.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function resolveConfigPath(env: NodeJS.ProcessEnv): string | undefined {
  const candidates = [
    env.ESR_CONFIG_PATH,
    join(process.cwd(), 'config.yaml'),
    join(packageRoot, 'config.yaml'),
    '/etc/esr/config.yaml',
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const path = isAbsolute(candidate) ? candidate : resolve(candidate)
    if (existsSync(path)) return path
  }

  return undefined
}

export function loadYamlConfig(env: NodeJS.ProcessEnv): RawConfig {
  const configPath = resolveConfigPath(env)
  if (!configPath) return {}

  const raw = readFileSync(configPath, 'utf8')
  const parsed = parse(raw)

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid config file: ${configPath}`)
  }

  return interpolateEnv(parsed as RawConfig, env) as RawConfig
}

function parseSlotPackages(value: string | undefined): number[] | undefined {
  if (!value) return undefined
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
}

function parseEnvBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined

  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false

  return undefined
}

export function loadEnvOverrides(env: NodeJS.ProcessEnv): RawConfig {
  const overrides: RawConfig = {}

  if (env.ESR_HOST || env.ESR_PORT || env.ESR_PUBLIC_URL || env.ESR_TRUST_PROXY) {
    overrides.server = {
      ...(overrides.server as RawConfig),
      ...(env.ESR_HOST ? { host: env.ESR_HOST } : {}),
      ...(env.ESR_PORT ? { port: env.ESR_PORT } : {}),
      ...(env.ESR_PUBLIC_URL ? { publicUrl: env.ESR_PUBLIC_URL } : {}),
      ...(env.ESR_TRUST_PROXY !== undefined ? { trustProxy: parseEnvBoolean(env.ESR_TRUST_PROXY) } : {}),
    }
  }

  if (env.ESR_DATABASE_URL || env.ESR_DATABASE_POOL_SIZE || env.ESR_DATABASE_SSL) {
    overrides.database = {
      ...(overrides.database as RawConfig),
      ...(env.ESR_DATABASE_URL ? { url: env.ESR_DATABASE_URL } : {}),
      ...(env.ESR_DATABASE_POOL_SIZE ? { poolSize: env.ESR_DATABASE_POOL_SIZE } : {}),
      ...(env.ESR_DATABASE_SSL !== undefined ? { ssl: parseEnvBoolean(env.ESR_DATABASE_SSL) } : {}),
    }
  }

  if (env.ESR_BLOB_PATH) {
    overrides.blob = {
      driver: 'filesystem',
      filesystem: { path: env.ESR_BLOB_PATH },
    }
  }

  if (
    env.ESR_MAX_ENVELOPE_BYTES ||
    env.ESR_MAX_DOCUMENTS_PER_NAMESPACE ||
    env.ESR_ALLOWED_DOCUMENT_IDS ||
    env.ESR_REVISION_RETENTION_DAYS ||
    env.ESR_REVISION_RETENTION_COUNT
  ) {
    overrides.sync = {
      ...(overrides.sync as RawConfig),
      ...(env.ESR_MAX_ENVELOPE_BYTES ? { maxEnvelopeBytes: env.ESR_MAX_ENVELOPE_BYTES } : {}),
      ...(env.ESR_MAX_DOCUMENTS_PER_NAMESPACE
        ? { maxDocumentsPerNamespace: env.ESR_MAX_DOCUMENTS_PER_NAMESPACE }
        : {}),
      ...(env.ESR_ALLOWED_DOCUMENT_IDS
        ? {
            allowedDocumentIds: env.ESR_ALLOWED_DOCUMENT_IDS.split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          }
        : {}),
      ...(env.ESR_REVISION_RETENTION_DAYS !== undefined
        ? { revisionRetentionDays: env.ESR_REVISION_RETENTION_DAYS }
        : {}),
      ...(env.ESR_REVISION_RETENTION_COUNT !== undefined
        ? { revisionRetentionCount: env.ESR_REVISION_RETENTION_COUNT }
        : {}),
    }
  }

  if (env.ESR_ADMIN_TOKEN || env.ESR_DEVICE_TOKEN_BYTES) {
    overrides.auth = {
      ...(overrides.auth as RawConfig),
      ...(env.ESR_ADMIN_TOKEN ? { adminApiToken: env.ESR_ADMIN_TOKEN } : {}),
      ...(env.ESR_DEVICE_TOKEN_BYTES ? { deviceTokenBytes: env.ESR_DEVICE_TOKEN_BYTES } : {}),
    }
  }

  if (
    env.ESR_DEFAULT_FREE_DEVICE_LIMIT ||
    env.ESR_ON_LIMIT_MODE ||
    env.ESR_SLOT_PACKAGES ||
    env.ESR_RATE_LIMIT_ENABLED ||
    env.ESR_RECOVER_PER_HOUR ||
    env.ESR_PAIRING_PER_HOUR ||
    env.ESR_PAIRING_TOKENS_PER_HOUR ||
    env.ESR_PUSH_PER_HOUR_PER_DEVICE ||
    env.ESR_GENERAL_PER_MINUTE_PER_IP
  ) {
    const slotPackages = parseSlotPackages(env.ESR_SLOT_PACKAGES)
    overrides.limits = {
      ...(overrides.limits as RawConfig),
      ...(env.ESR_DEFAULT_FREE_DEVICE_LIMIT
        ? { defaultFreeDeviceLimit: env.ESR_DEFAULT_FREE_DEVICE_LIMIT }
        : {}),
      ...(env.ESR_ON_LIMIT_MODE || slotPackages
        ? {
            onLimitReached: {
              ...(env.ESR_ON_LIMIT_MODE ? { mode: env.ESR_ON_LIMIT_MODE } : {}),
              ...(slotPackages ? { slotPackages } : {}),
            },
          }
        : {}),
      ...(env.ESR_RATE_LIMIT_ENABLED || env.ESR_RECOVER_PER_HOUR || env.ESR_PAIRING_PER_HOUR || env.ESR_PAIRING_TOKENS_PER_HOUR || env.ESR_PUSH_PER_HOUR_PER_DEVICE || env.ESR_GENERAL_PER_MINUTE_PER_IP || env.ESR_DEVELOPER_AUTH_MAIL_PER_HOUR_PER_IP
        ? {
            rateLimit: {
              ...(env.ESR_RATE_LIMIT_ENABLED !== undefined
                ? { enabled: parseEnvBoolean(env.ESR_RATE_LIMIT_ENABLED) }
                : {}),
              ...(env.ESR_RECOVER_PER_HOUR ? { recoverPerHour: env.ESR_RECOVER_PER_HOUR } : {}),
              ...(env.ESR_PAIRING_PER_HOUR ? { pairingPerHour: env.ESR_PAIRING_PER_HOUR } : {}),
              ...(env.ESR_PAIRING_TOKENS_PER_HOUR ? { pairingTokensPerHour: env.ESR_PAIRING_TOKENS_PER_HOUR } : {}),
              ...(env.ESR_PUSH_PER_HOUR_PER_DEVICE ? { pushPerHourPerDevice: env.ESR_PUSH_PER_HOUR_PER_DEVICE } : {}),
              ...(env.ESR_GENERAL_PER_MINUTE_PER_IP ? { generalPerMinutePerIp: env.ESR_GENERAL_PER_MINUTE_PER_IP } : {}),
              ...(env.ESR_DEVELOPER_AUTH_MAIL_PER_HOUR_PER_IP
                ? { developerAuthMailPerHourPerIp: env.ESR_DEVELOPER_AUTH_MAIL_PER_HOUR_PER_IP }
                : {}),
            },
          }
        : {}),
    }
  }

  if (env.ESR_UNLOCK_HMAC_SECRET || env.ESR_UNLOCK_CODE_PREFIX) {
    overrides.unlock = {
      ...(overrides.unlock as RawConfig),
      ...(env.ESR_UNLOCK_HMAC_SECRET ? { hmacSecret: env.ESR_UNLOCK_HMAC_SECRET } : {}),
      ...(env.ESR_UNLOCK_CODE_PREFIX ? { codePrefix: env.ESR_UNLOCK_CODE_PREFIX } : {}),
    }
  }

  if (env.ESR_CORS_ORIGINS) {
    overrides.cors = {
      allowedOrigins:
        env.ESR_CORS_ORIGINS === '*'
          ? ['*']
          : env.ESR_CORS_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean),
    }
  }

  if (
    env.ESR_APPS__ENABLED ||
    env.ESR_APPS__REGISTRATION_MODE ||
    env.ESR_APPS__ALLOW_LOCALHOST_ORIGINS ||
    env.ESR_APPS__LEGACY_DEFAULT_APP_ID ||
    env.ESR_APPS__NATIVE__REQUIRE_CLIENT_SECRET ||
    env.ESR_APPS__NATIVE__REQUIRE_MANUAL_REVIEW ||
    env.ESR_APPS__DEVELOPER_PORTAL__JWT_SECRET ||
    env.ESR_DEVELOPER_JWT_SECRET ||
    env.ESR_APPS__LIMITS__PER_APP__NAMESPACES_PER_DAY ||
    env.ESR_APPS__LIMITS__PER_APP__PAIRING_TOKENS_PER_HOUR ||
    env.ESR_APPS__LIMITS__PER_APP__RECOVER_PER_HOUR ||
    env.ESR_DEVELOPER_AUTH_MAIL_PER_HOUR
  ) {
    const developerJwtSecret = env.ESR_APPS__DEVELOPER_PORTAL__JWT_SECRET ?? env.ESR_DEVELOPER_JWT_SECRET
    const perAppLimits =
      env.ESR_APPS__LIMITS__PER_APP__NAMESPACES_PER_DAY ||
      env.ESR_APPS__LIMITS__PER_APP__PAIRING_TOKENS_PER_HOUR ||
      env.ESR_APPS__LIMITS__PER_APP__RECOVER_PER_HOUR
        ? {
            ...(env.ESR_APPS__LIMITS__PER_APP__NAMESPACES_PER_DAY
              ? { namespacesPerDay: env.ESR_APPS__LIMITS__PER_APP__NAMESPACES_PER_DAY }
              : {}),
            ...(env.ESR_APPS__LIMITS__PER_APP__PAIRING_TOKENS_PER_HOUR
              ? { pairingTokensPerHour: env.ESR_APPS__LIMITS__PER_APP__PAIRING_TOKENS_PER_HOUR }
              : {}),
            ...(env.ESR_APPS__LIMITS__PER_APP__RECOVER_PER_HOUR
              ? { recoverPerHour: env.ESR_APPS__LIMITS__PER_APP__RECOVER_PER_HOUR }
              : {}),
          }
        : undefined

    const nativeOverrides =
      env.ESR_APPS__NATIVE__REQUIRE_CLIENT_SECRET !== undefined ||
      env.ESR_APPS__NATIVE__REQUIRE_MANUAL_REVIEW !== undefined
        ? {
            ...(env.ESR_APPS__NATIVE__REQUIRE_CLIENT_SECRET !== undefined
              ? { requireClientSecret: parseEnvBoolean(env.ESR_APPS__NATIVE__REQUIRE_CLIENT_SECRET) }
              : {}),
            ...(env.ESR_APPS__NATIVE__REQUIRE_MANUAL_REVIEW !== undefined
              ? { requireManualReview: parseEnvBoolean(env.ESR_APPS__NATIVE__REQUIRE_MANUAL_REVIEW) }
              : {}),
          }
        : undefined

    const developerPortalOverrides = {
      ...(developerJwtSecret ? { jwtSecret: developerJwtSecret } : {}),
      ...(env.ESR_DEVELOPER_AUTH_MAIL_PER_HOUR
        ? { authMailPerHourPerDeveloper: env.ESR_DEVELOPER_AUTH_MAIL_PER_HOUR }
        : {}),
    }

    overrides.apps = {
      ...(overrides.apps as RawConfig),
      ...(env.ESR_APPS__ENABLED !== undefined ? { enabled: parseEnvBoolean(env.ESR_APPS__ENABLED) } : {}),
      ...(env.ESR_APPS__REGISTRATION_MODE ? { registrationMode: env.ESR_APPS__REGISTRATION_MODE } : {}),
      ...(env.ESR_APPS__ALLOW_LOCALHOST_ORIGINS !== undefined
        ? { allowLocalhostOrigins: parseEnvBoolean(env.ESR_APPS__ALLOW_LOCALHOST_ORIGINS) }
        : {}),
      ...(env.ESR_APPS__LEGACY_DEFAULT_APP_ID
        ? { legacyDefaultAppId: env.ESR_APPS__LEGACY_DEFAULT_APP_ID }
        : {}),
      ...(nativeOverrides ? { native: nativeOverrides } : {}),
      ...(Object.keys(developerPortalOverrides).length > 0
        ? { developerPortal: developerPortalOverrides }
        : {}),
      ...(perAppLimits
        ? {
            limits: {
              perApp: perAppLimits,
            },
          }
        : {}),
    }
  }

  if (env.LOG_LEVEL || env.ESR_LOG_FORMAT) {
    overrides.logging = {
      ...(overrides.logging as RawConfig),
      ...(env.LOG_LEVEL ? { level: env.LOG_LEVEL } : {}),
      ...(env.ESR_LOG_FORMAT ? { format: env.ESR_LOG_FORMAT } : {}),
    }
  }

  if (env.ESR_WEBSOCKET_ENABLED || env.ESR_WS_PING_INTERVAL) {
    overrides.websocket = {
      ...(overrides.websocket as RawConfig),
      ...(env.ESR_WEBSOCKET_ENABLED !== undefined
        ? { enabled: parseEnvBoolean(env.ESR_WEBSOCKET_ENABLED) }
        : {}),
      ...(env.ESR_WS_PING_INTERVAL ? { pingIntervalSeconds: env.ESR_WS_PING_INTERVAL } : {}),
    }
  }

  if (
    env.ESR_MAIL__ENABLED ||
    env.ESR_MAIL__FROM ||
    env.ESR_MAIL__FROM_NAME ||
    env.ESR_MAIL__WEB_BASE_URL ||
    env.ESR_SMTP__HOST ||
    env.ESR_SMTP__PORT ||
    env.ESR_SMTP__SECURE ||
    env.ESR_SMTP__USER ||
    env.ESR_SMTP__PASSWORD
  ) {
    const smtpOverrides =
      env.ESR_SMTP__HOST ||
      env.ESR_SMTP__PORT ||
      env.ESR_SMTP__SECURE ||
      env.ESR_SMTP__USER ||
      env.ESR_SMTP__PASSWORD
        ? {
            ...(env.ESR_SMTP__HOST ? { host: env.ESR_SMTP__HOST } : {}),
            ...(env.ESR_SMTP__PORT ? { port: env.ESR_SMTP__PORT } : {}),
            ...(env.ESR_SMTP__SECURE !== undefined
              ? { secure: parseEnvBoolean(env.ESR_SMTP__SECURE) }
              : {}),
            ...(env.ESR_SMTP__USER ? { user: env.ESR_SMTP__USER } : {}),
            ...(env.ESR_SMTP__PASSWORD ? { password: env.ESR_SMTP__PASSWORD } : {}),
          }
        : undefined

    overrides.mail = {
      ...(overrides.mail as RawConfig),
      ...(env.ESR_MAIL__ENABLED !== undefined ? { enabled: parseEnvBoolean(env.ESR_MAIL__ENABLED) } : {}),
      ...(env.ESR_MAIL__FROM ? { from: env.ESR_MAIL__FROM } : {}),
      ...(env.ESR_MAIL__FROM_NAME ? { fromName: env.ESR_MAIL__FROM_NAME } : {}),
      ...(env.ESR_MAIL__WEB_BASE_URL ? { webBaseUrl: env.ESR_MAIL__WEB_BASE_URL } : {}),
      ...(smtpOverrides ? { smtp: smtpOverrides } : {}),
    }
  }

  return overrides
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const yamlConfig = loadYamlConfig(env)
  const envOverrides = loadEnvOverrides(env)
  const merged = deepMerge(yamlConfig, envOverrides)

  return serverConfigSchema.parse(merged)
}

export function getDatabaseMode(databaseUrl: string): 'bundled' | 'external' {
  return databaseUrl.includes('@postgres:') ? 'bundled' : 'external'
}
