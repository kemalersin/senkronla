-- Rename document PUT rate limit action id (was put_primary).
UPDATE rate_limit_events
SET action = 'put_document'
WHERE action = 'put_primary';
