-- Approval system v2: blocked task state, comments, auto-policies, decision tracking.
--
-- Changes:
--   1. tasks.status CHECK gains 'blocked' (task is waiting on an approval).
--      SQLite can't ALTER CHECK in place, so recreate the table.
--   2. approvals gains task_id, decision_note, decided_by_kind, decided_by_id;
--      status CHECK gains 'revision_requested' (paperclip-style push-back loop).
--   3. New approval_comments table — discussion thread per approval.
--   4. New approval_policies table — "always allow" / "always reject" rules
--      consulted before pending rows are created.

-- ── tasks: add 'blocked' to status CHECK ──────────────────────────────
CREATE TABLE tasks_new (
  id                TEXT PRIMARY KEY,
  project_slug      TEXT NOT NULL REFERENCES projects(slug),
  agent_id          TEXT NOT NULL,
  brief             TEXT NOT NULL,
  success_criteria  TEXT,
  deadline_iso      TEXT,
  status            TEXT NOT NULL CHECK (status IN ('proposed','approved','running','blocked','succeeded','failed','cancelled')),
  result_json       TEXT,
  error_message     TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  title             TEXT,
  thread_id         TEXT,
  assigner_agent_id TEXT,
  display_id        TEXT
);
INSERT INTO tasks_new (id, project_slug, agent_id, brief, success_criteria, deadline_iso, status, result_json, error_message, created_at, updated_at, title, thread_id, assigner_agent_id, display_id)
SELECT id, project_slug, agent_id, brief, success_criteria, deadline_iso, status, result_json, error_message, created_at, updated_at, title, thread_id, assigner_agent_id, display_id
FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_slug);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(project_slug, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_display_id ON tasks(display_id);

-- ── approvals: task_id, decision_note, decided_by_*, 'revision_requested' status ──
CREATE TABLE approvals_new (
  id                TEXT PRIMARY KEY,
  project_slug      TEXT NOT NULL REFERENCES projects(slug),
  agent_id          TEXT NOT NULL,
  task_id           TEXT,
  action_summary    TEXT NOT NULL,
  action_type       TEXT NOT NULL CHECK (action_type IN ('spend','content_publishing','new_channel','bid_change','audience_change','other')),
  cost_estimate_usd REAL NOT NULL DEFAULT 0,
  reasoning         TEXT,
  payload_json      TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('pending','revision_requested','approved','rejected','expired')),
  decision_note     TEXT,
  decided_by_kind   TEXT CHECK (decided_by_kind IN ('user','agent','policy')),
  decided_by_id     TEXT,
  created_at        TEXT NOT NULL,
  resolved_at       TEXT
);
INSERT INTO approvals_new (id, project_slug, agent_id, action_summary, action_type, cost_estimate_usd, reasoning, payload_json, status, created_at, resolved_at)
SELECT id, project_slug, agent_id, action_summary, action_type, cost_estimate_usd, reasoning, payload_json, status, created_at, resolved_at
FROM approvals;
DROP TABLE approvals;
ALTER TABLE approvals_new RENAME TO approvals;
-- Partial index: rows that still need attention (pending OR revision_requested).
CREATE INDEX IF NOT EXISTS idx_approvals_actionable ON approvals(project_slug, status) WHERE status IN ('pending','revision_requested');
CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id) WHERE task_id IS NOT NULL;

-- ── approval_comments: discussion thread per approval ─────────────────
-- Author kinds: 'user' = human, 'agent' = the requesting/deciding agent,
-- 'system' = automated notes (e.g., "auto-approved by policy <id>").
CREATE TABLE IF NOT EXISTS approval_comments (
  id          TEXT PRIMARY KEY,
  approval_id TEXT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('user','agent','system')),
  author_id   TEXT,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approval_comments_approval ON approval_comments(approval_id, created_at);

-- ── approval_policies: auto-decide rules consulted before pending row is created ──
-- agent_id IS NULL means "any agent". max_cost_usd IS NULL means "no cost cap".
-- auto_decision='approve' auto-approves matching requests; ='reject' blocks them.
CREATE TABLE IF NOT EXISTS approval_policies (
  id              TEXT PRIMARY KEY,
  project_slug    TEXT NOT NULL REFERENCES projects(slug),
  action_type     TEXT NOT NULL CHECK (action_type IN ('spend','content_publishing','new_channel','bid_change','audience_change','other')),
  agent_id        TEXT,
  max_cost_usd    REAL,
  auto_decision   TEXT NOT NULL CHECK (auto_decision IN ('approve','reject')),
  note            TEXT,
  created_at      TEXT NOT NULL,
  created_by_kind TEXT NOT NULL CHECK (created_by_kind IN ('user','agent')),
  created_by_id   TEXT
);
CREATE INDEX IF NOT EXISTS idx_approval_policies_project ON approval_policies(project_slug, action_type);
