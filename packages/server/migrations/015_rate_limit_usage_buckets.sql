-- Sliding-window counters in minute buckets; rate_limit_events = violations only.

CREATE TABLE rate_limit_usage_buckets (
  action TEXT NOT NULL,
  namespace_uuid UUID REFERENCES namespaces(id) ON DELETE CASCADE,
  device_uuid UUID REFERENCES devices(id) ON DELETE CASCADE,
  client_ip TEXT,
  app_uuid UUID REFERENCES apps(id) ON DELETE SET NULL,
  bucket_at TIMESTAMPTZ NOT NULL,
  hit_count INT NOT NULL DEFAULT 0,
  CONSTRAINT rate_limit_usage_buckets_hit_count_positive CHECK (hit_count > 0)
);

CREATE UNIQUE INDEX rate_limit_usage_buckets_scope_bucket
  ON rate_limit_usage_buckets (
    action,
    namespace_uuid,
    device_uuid,
    client_ip,
    app_uuid,
    bucket_at
  )
  NULLS NOT DISTINCT;

CREATE INDEX idx_rate_limit_usage_buckets_bucket_at
  ON rate_limit_usage_buckets (bucket_at);

CREATE INDEX idx_rate_limit_usage_buckets_namespace
  ON rate_limit_usage_buckets (namespace_uuid, action, bucket_at DESC)
  WHERE namespace_uuid IS NOT NULL;

CREATE INDEX idx_rate_limit_usage_buckets_device
  ON rate_limit_usage_buckets (device_uuid, action, bucket_at DESC)
  WHERE device_uuid IS NOT NULL;

CREATE INDEX idx_rate_limit_usage_buckets_ip
  ON rate_limit_usage_buckets (client_ip, action, bucket_at DESC)
  WHERE client_ip IS NOT NULL;

CREATE INDEX idx_rate_limit_usage_buckets_app_ip
  ON rate_limit_usage_buckets (app_uuid, client_ip, action, bucket_at DESC)
  WHERE app_uuid IS NOT NULL AND client_ip IS NOT NULL;

-- Drop quota rows; keep violation log rows.
DELETE FROM rate_limit_events WHERE exceeded IS NOT TRUE;

ALTER TABLE rate_limit_events DROP COLUMN IF EXISTS exceeded;

DROP INDEX IF EXISTS idx_rate_limit_events_exceeded_created;
