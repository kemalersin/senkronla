import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import type { AppAuthContext } from '../services/app-registry-service.js'
import type { NotificationHub } from '../services/notification-hub.js'

export interface DeviceAuthContext {
  deviceUuid: string
  deviceId: string
  namespaceUuid: string
  namespaceId: string
  clientDeviceId: string
  label: string
  isHost: boolean
}

export interface DeveloperAuthContext {
  developerUuid: string
  email: string
}

export interface AppContext {
  config: ServerConfig
  db: DbPool
  notificationHub?: NotificationHub
}

declare module 'fastify' {
  interface FastifyRequest {
    deviceAuth?: DeviceAuthContext
    appAuth?: AppAuthContext
    developerAuth?: DeveloperAuthContext
  }
}
