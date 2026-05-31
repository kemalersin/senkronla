ALTER TABLE namespaces ADD COLUMN IF NOT EXISTS limit_overrides JSONB DEFAULT NULL;
ALTER TABLE apps ADD COLUMN IF NOT EXISTS limit_overrides JSONB DEFAULT NULL;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS limit_overrides JSONB DEFAULT NULL;

ALTER TABLE rate_limit_events ADD COLUMN IF NOT EXISTS app_uuid UUID REFERENCES apps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_app_action
  ON rate_limit_events (app_uuid, action, created_at)
  WHERE app_uuid IS NOT NULL;

CREATE TABLE IF NOT EXISTS operator_limit_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('namespace', 'app', 'developer')),
  scope_id UUID NOT NULL,
  before_overrides JSONB,
  after_overrides JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operator_limit_audit_scope
  ON operator_limit_audit (scope_type, scope_id, created_at DESC);
