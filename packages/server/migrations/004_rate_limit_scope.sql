-- Migration 004: extend rate limit events for device and IP scoped throttles

ALTER TABLE rate_limit_events
  ALTER COLUMN namespace_uuid DROP NOT NULL;

ALTER TABLE rate_limit_events
  ADD COLUMN device_uuid UUID REFERENCES devices(id) ON DELETE SET NULL,
  ADD COLUMN client_ip TEXT;

CREATE INDEX idx_rate_limit_events_device
  ON rate_limit_events(device_uuid, action, created_at DESC)
  WHERE device_uuid IS NOT NULL;

CREATE INDEX idx_rate_limit_events_ip
  ON rate_limit_events(client_ip, action, created_at DESC)
  WHERE client_ip IS NOT NULL;
