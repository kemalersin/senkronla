-- Separate quota counters (exceeded = false) from operator violation log (exceeded = true).

ALTER TABLE rate_limit_events
  ADD COLUMN IF NOT EXISTS exceeded BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_exceeded_created
  ON rate_limit_events (exceeded, created_at DESC)
  WHERE exceeded = true;
