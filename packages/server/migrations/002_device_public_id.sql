-- Migration 002: public ULID device id for API paths

ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_device_id
  ON devices(device_id)
  WHERE device_id IS NOT NULL;
