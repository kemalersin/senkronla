import type { ServerConfig } from '../config/schema.js'

export function isDeveloperPortalEnabled(config: ServerConfig): boolean {
  if (!config.apps.enabled) {
    return false
  }

  if (config.apps.registrationMode !== 'self_service') {
    return false
  }

  return Boolean(config.apps.developerPortal.jwtSecret)
}

export function assertDeveloperPortalEnabled(config: ServerConfig): void {
  if (!isDeveloperPortalEnabled(config)) {
    throw new Error('DEVELOPER_PORTAL_DISABLED')
  }
}
