ALTER TABLE developers
  ADD COLUMN disabled_at TIMESTAMPTZ;

CREATE INDEX idx_developers_disabled_at ON developers(disabled_at)
  WHERE disabled_at IS NOT NULL;
