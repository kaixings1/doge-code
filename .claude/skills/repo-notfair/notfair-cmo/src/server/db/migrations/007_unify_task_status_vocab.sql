-- Unify TaskStatus vocabulary on the agent-facing verb form.
--
-- Before: tasks.status ∈ proposed | approved | running | blocked | succeeded | failed | cancelled
-- After:  tasks.status ∈ proposed | approved | working | blocked | done    | failed | cancelled
--
-- Rationale: the `submit_task_status` MCP tool always accepted the verb
-- enum (working/done/blocked/failed), then the handler mapped it to the
-- DB's noun enum (running/succeeded). The mapping created a visible
-- inconsistency between what the agent calls + what the UI shows on
-- /tasks ("Succeeded" / "Running"), and what the `list_task_statuses`
-- discovery tool returned. One vocabulary everywhere = no mapping layer,
-- no drift surface.
--
-- SQLite can't ALTER CHECK constraints in place — recreate the table.
-- Existing rows are transformed via CASE during the INSERT...SELECT.

CREATE TABLE tasks_new (
  id                TEXT PRIMARY KEY,
  project_slug      TEXT NOT NULL REFERENCES projects(slug),
  agent_id          TEXT NOT NULL,
  brief             TEXT NOT NULL,
  success_criteria  TEXT,
  deadline_iso      TEXT,
  status            TEXT NOT NULL CHECK (status IN ('proposed','approved','working','blocked','done','failed','cancelled')),
  result_json       TEXT,
  error_message     TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  title             TEXT,
  thread_id         TEXT,
  assigner_agent_id TEXT,
  display_id        TEXT
);

INSERT INTO tasks_new (
  id, project_slug, agent_id, brief, success_criteria, deadline_iso,
  status, result_json, error_message, created_at, updated_at, title,
  thread_id, assigner_agent_id, display_id
)
SELECT
  id, project_slug, agent_id, brief, success_criteria, deadline_iso,
  CASE status
    WHEN 'running' THEN 'working'
    WHEN 'succeeded' THEN 'done'
    ELSE status
  END AS status,
  result_json, error_message, created_at, updated_at, title,
  thread_id, assigner_agent_id, display_id
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_slug);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(project_slug, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_display_id ON tasks(display_id);
