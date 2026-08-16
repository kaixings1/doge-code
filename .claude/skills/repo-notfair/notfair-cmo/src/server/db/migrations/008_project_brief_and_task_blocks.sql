-- Migration 008: project context inputs + task-blocks-task dependencies.
--
-- Two unrelated-looking changes ship together because they're the schema
-- side of the same product change: the new CMO onboarding task that learns
-- about the project (writes PROJECT.md), and the audit task gated on it.
--
-- 1. projects gains two optional inputs collected at onboarding time:
--    `website_url` and `codebase_path`. The CMO uses whichever are present
--    to research the project during its first task and produce PROJECT.md.
--
-- 2. tasks gains `blocked_by_task_id` — a generic "this task can't start
--    until that one finishes" pointer. When the blocker transitions to
--    `done`, the orchestrator clears the pointer, flips the dependent
--    blocked→proposed, and kicks it off. Co-exists with approval-blocking
--    (approval-blocked tasks have a null blocked_by_task_id and resolve
--    via the existing wakeTaskOnApprovalResolution path).
ALTER TABLE projects ADD COLUMN website_url TEXT;
ALTER TABLE projects ADD COLUMN codebase_path TEXT;

ALTER TABLE tasks ADD COLUMN blocked_by_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_blocked_by ON tasks(blocked_by_task_id) WHERE blocked_by_task_id IS NOT NULL;
