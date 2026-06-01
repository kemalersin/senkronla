-- Revision history for document blobs (doc 10 §11)

CREATE TABLE document_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_uuid UUID NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  blob_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  content_magic TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  writer_device_id TEXT NOT NULL,
  written_at TIMESTAMPTZ NOT NULL,
  UNIQUE (namespace_uuid, document_id, revision)
);

CREATE INDEX idx_document_revisions_written_at
  ON document_revisions (namespace_uuid, written_at);

CREATE INDEX idx_document_revisions_namespace_doc
  ON document_revisions (namespace_uuid, document_id, written_at);

-- Seed history from current heads so existing blobs remain reachable.
INSERT INTO document_revisions (
  namespace_uuid,
  document_id,
  revision,
  blob_key,
  content_sha256,
  content_magic,
  size_bytes,
  writer_device_id,
  written_at
)
SELECT
  namespace_uuid,
  document_id,
  revision,
  blob_key,
  content_sha256,
  content_magic,
  size_bytes,
  writer_device_id,
  written_at
FROM document_heads;
