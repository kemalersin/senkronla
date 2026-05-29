import { resolve } from 'node:path'
import type { ServerConfig } from '../config/schema.js'

export function logStartupWarnings(config: ServerConfig): void {
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction && config.cors.allowedOrigins.includes('*') && !config.apps.enabled) {
    console.warn(
      '[senkronla] CORS allows all origins (*). Set cors.allowedOrigins to explicit domains in production.',
    )
  }

  if (isProduction && config.apps.allowLocalhostOrigins) {
    console.warn(
      '[senkronla] apps.allowLocalhostOrigins is enabled. Disable in production deployments.',
    )
  }

  if (isProduction && !config.server.trustProxy) {
    console.warn(
      '[senkronla] trustProxy is disabled. Enable server.trustProxy when running behind a reverse proxy.',
    )
  }

  if (!config.auth.adminApiToken) {
    console.warn('[senkronla] Admin API token is not configured. Admin endpoints are disabled.')
  }

  const blobPath = resolve(config.blob.filesystem.path)
  if (isProduction && (blobPath === './data/blobs' || blobPath.startsWith('/tmp'))) {
    console.warn(`[senkronla] Blob path "${config.blob.filesystem.path}" may be unsuitable for production.`)
  }
}
