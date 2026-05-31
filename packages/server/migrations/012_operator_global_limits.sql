-- Allow operator-scoped limit audit rows for deployment-wide overrides.
ALTER TABLE operator_limit_audit DROP CONSTRAINT IF EXISTS operator_limit_audit_scope_type_check;
ALTER TABLE operator_limit_audit ADD CONSTRAINT operator_limit_audit_scope_type_check
  CHECK (scope_type IN ('namespace', 'app', 'developer', 'operator'));
