import { z } from 'zod'

export const DEFAULT_DATABASE_URL = 'postgresql://esr:esr@localhost:5432/esr'

export const serverConfigSchema = z.object({
  server: z
    .object({
      host: z.string().default('0.0.0.0'),
      port: z.coerce.number().int().positive().default(8080),
      publicUrl: z.string().url().default('http://localhost:8080'),
      trustProxy: z.coerce.boolean().default(false),
    })
    .default({}),
  database: z
    .object({
      url: z.string().min(1).default(DEFAULT_DATABASE_URL),
      poolSize: z.coerce.number().int().positive().default(10),
      ssl: z.coerce.boolean().default(false),
    })
    .default({}),
  blob: z
    .object({
      driver: z.enum(['filesystem']).default('filesystem'),
      filesystem: z
        .object({
          path: z.string().default('./data/blobs'),
        })
        .default({}),
    })
    .default({}),
  auth: z
    .object({
      adminApiToken: z.string().min(32).optional(),
      deviceTokenBytes: z.coerce.number().int().positive().default(32),
    })
    .default({}),
  recovery: z
    .object({
      argon2: z
        .object({
          memoryCost: z.coerce.number().int().positive().default(65536),
          timeCost: z.coerce.number().int().positive().default(3),
          parallelism: z.coerce.number().int().positive().default(4),
        })
        .default({}),
    })
    .default({}),
  limits: z
    .object({
      defaultFreeDeviceLimit: z.coerce.number().int().positive().default(2),
      onLimitReached: z
        .object({
          mode: z.enum(['payment', 'block']).default('payment'),
          slotPackages: z.array(z.coerce.number().int().positive()).default([3, 5, 10]),
        })
        .default({}),
      rateLimit: z
        .object({
          enabled: z.coerce.boolean().default(true),
          recoverPerHour: z.coerce.number().int().positive().default(5),
          pairingPerHour: z.coerce.number().int().positive().default(20),
          pairingTokensPerHour: z.coerce.number().int().positive().default(30),
          pushPerHourPerDevice: z.coerce.number().int().positive().default(120),
          generalPerMinutePerIp: z.coerce.number().int().positive().default(300),
        })
        .default({}),
    })
    .default({}),
  pairing: z
    .object({
      codeTtlSeconds: z.coerce.number().int().positive().default(600),
      codeLength: z.coerce.number().int().positive().default(6),
      maxTtlSeconds: z.coerce.number().int().positive().default(3600),
    })
    .default({}),
  sync: z
    .object({
      maxEnvelopeBytes: z.coerce.number().int().positive().default(52_428_800),
      allowedContentTypes: z.array(z.string()).default([]),
    })
    .default({}),
  unlock: z
    .object({
      codePrefix: z.string().default('ESR-UNLK'),
      defaultExpiryDays: z.coerce.number().int().positive().default(365),
      hmacSecret: z.string().min(32).optional(),
    })
    .default({}),
  cors: z
    .object({
      allowedOrigins: z.array(z.string()).default(['*']),
    })
    .default({}),
  logging: z
    .object({
      level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
      format: z.enum(['json', 'pretty']).default('json'),
      redactPaths: z
        .array(z.string())
        .default(['envelope.payload', 'deviceToken', 'recoveryKeyProof']),
    })
    .default({}),
  metrics: z
    .object({
      enabled: z.coerce.boolean().default(true),
      path: z.string().default('/metrics'),
    })
    .default({}),
  websocket: z
    .object({
      enabled: z.coerce.boolean().default(true),
      pingIntervalSeconds: z.coerce.number().int().positive().default(30),
      pongTimeoutSeconds: z.coerce.number().int().positive().default(10),
      maxConnectionsPerNamespace: z.coerce.number().int().positive().default(20),
      maxConnectionsPerDevice: z.coerce.number().int().positive().default(3),
    })
    .default({}),
})

export type ServerConfig = z.infer<typeof serverConfigSchema>

export type RawConfig = Record<string, unknown>
