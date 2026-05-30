-- Allow desktop as a native bundle platform (Electron, Tauri, etc.)

ALTER TABLE app_bundles DROP CONSTRAINT app_bundles_platform_check;

ALTER TABLE app_bundles ADD CONSTRAINT app_bundles_platform_check
  CHECK (platform IN ('ios', 'android', 'desktop'));
