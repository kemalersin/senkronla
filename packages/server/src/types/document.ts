export interface DocumentHeadRow {
  namespace_uuid: string
  document_id: string
  revision: string
  blob_key: string
  content_sha256: string
  content_magic: string
  size_bytes: string
  writer_device_id: string
  written_at: Date
}

export interface DocumentHeadMeta {
  revision: string
  writtenAt: string
  deviceId: string
  contentSha256: string
  contentMagic: string
  sizeBytes: number
}

export function toDocumentHeadMeta(row: DocumentHeadRow): DocumentHeadMeta {
  return {
    revision: row.revision,
    writtenAt: row.written_at.toISOString(),
    deviceId: row.writer_device_id,
    contentSha256: row.content_sha256,
    contentMagic: row.content_magic,
    sizeBytes: Number(row.size_bytes),
  }
}
