CREATE TABLE IF NOT EXISTS operator_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS developer_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_uuid UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('email_verify', 'password_reset')),
  token_hash TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'tr')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_developer_auth_tokens_hash
  ON developer_auth_tokens (purpose, token_hash)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_developer_auth_tokens_developer
  ON developer_auth_tokens (developer_uuid, purpose, created_at DESC);
