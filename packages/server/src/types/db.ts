export interface NamespaceRow {
  id: string
  namespace_id: string
  namespace_label: string
  free_device_limit: number
  purchased_slots: number
  recovery_salt: string
  recovery_hash: string
  created_at: Date
  updated_at: Date
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
