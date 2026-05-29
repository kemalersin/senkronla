CREATE TABLE developers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL UNIQUE,
  developer_uuid UUID REFERENCES developers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('web', 'native')),
  status TEXT NOT NULL DEFAULT 'pending',
  client_secret_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app_origins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_uuid UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  verification_token TEXT NOT NULL DEFAULT '',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_uuid, origin)
);

CREATE UNIQUE INDEX idx_app_origins_origin_verified
  ON app_origins(origin)
  WHERE verified_at IS NOT NULL;

CREATE TABLE app_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_uuid UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  bundle_id TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_uuid, platform, bundle_id)
);

ALTER TABLE namespaces
  ADD COLUMN app_uuid UUID REFERENCES apps(id) ON DELETE RESTRICT;

CREATE INDEX idx_namespaces_app_uuid ON namespaces(app_uuid);

ALTER TABLE pairing_tokens
  ADD COLUMN allowed_app_ids TEXT[] DEFAULT NULL;
