import type { NativePlatform } from '@senkronla/protocol'

export interface NamespaceRow {
  id: string
  namespace_id: string
  namespace_label: string
  free_device_limit: number
  purchased_slots: number
  recovery_salt: string
  recovery_hash: string
  app_uuid: string | null
  created_at: Date
  updated_at: Date
}

export interface AppRow {
  id: string
  app_id: string
  developer_uuid: string | null
  name: string
  type: 'web' | 'native'
  status: string
  client_secret_hash: string | null
  created_at: Date
  updated_at: Date
}

export interface AppOriginRow {
  id: string
  app_uuid: string
  origin: string
  verification_token: string
  verified_at: Date | null
  created_at: Date
}

export interface AppBundleRow {
  id: string
  app_uuid: string
  platform: NativePlatform
  bundle_id: string
  verified_at: Date | null
  created_at: Date
}

export interface DeviceRow {
  id: string
  namespace_uuid: string
  device_id: string | null
  client_device_id: string
  label: string
  token_hash: string
  is_host: boolean
  paired_at: Date
  last_seen_at: Date | null
  revoked_at: Date | null
}

export interface DocumentHeadRow {
  revision: string
  written_at: Date
  writer_device_id: string
  content_sha256: string
  content_magic: string
  size_bytes: string
  blob_key: string
}
