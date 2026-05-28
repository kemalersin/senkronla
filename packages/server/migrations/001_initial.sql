-- Migration 001: initial schema (doc 10)

CREATE TABLE namespaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id TEXT NOT NULL UNIQUE,
  namespace_label TEXT NOT NULL,
  free_device_limit INT NOT NULL,
  purchased_slots INT NOT NULL DEFAULT 0,
  recovery_salt TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT namespaces_namespace_id_uuid CHECK (
    namespace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  )
);

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_uuid UUID NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  client_device_id TEXT NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  is_host BOOLEAN NOT NULL DEFAULT false,
  paired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE (namespace_uuid, client_device_id)
);

CREATE INDEX idx_devices_namespace_active
  ON devices(namespace_uuid)
  WHERE revoked_at IS NULL;

CREATE TABLE pairing_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_uuid UUID NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pairing_tokens_namespace
  ON pairing_tokens(namespace_uuid)
  WHERE redeemed_at IS NULL;

CREATE TABLE document_heads (
  namespace_uuid UUID NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL DEFAULT 'primary',
  revision TEXT NOT NULL,
  blob_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  content_magic TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  writer_device_id TEXT NOT NULL,
  written_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (namespace_uuid, document_id)
);

CREATE TABLE unlock_codes (
  code TEXT PRIMARY KEY,
  namespace_id TEXT NOT NULL,
  slots INT NOT NULL CHECK (slots > 0),
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE unlock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_uuid UUID NOT NULL REFERENCES namespaces(id),
  slots_added INT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('code', 'webhook', 'admin')),
  unlock_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
