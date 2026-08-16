-- Human-readable per-project task IDs (e.g. demo7-3) shown in the UI and
-- used in URLs. PK stays as the UUID for FK integrity / agent protocol;
-- display_id is the surface that humans + URLs see.
--
-- Backfill assigns sequential numbers in created_at order per project,
-- so existing demos get pretty IDs without manual cleanup.
ALTER TABLE tasks ADD COLUMN display_id TEXT;

WITH numbered AS (
  SELECT
    id,
    project_slug || '-' || ROW_NUMBER() OVER (
      PARTITION BY project_slug ORDER BY created_at
    ) AS dn
  FROM tasks
)
UPDATE tasks
SET display_id = numbered.dn
FROM numbered
WHERE tasks.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_display_id ON tasks(display_id);
