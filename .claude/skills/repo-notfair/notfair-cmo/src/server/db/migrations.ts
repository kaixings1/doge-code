// Embedded migration manifest. The canonical SQL lives in migrations/*.sql for
// readability and editor tooling; this file is a small generated mirror so the
// production build doesn't need filesystem access to apply migrations.
//
// To add a migration:
//   1. Write src/server/db/migrations/00N_<name>.sql
//   2. Append an entry below with the SAME contents (order = apply order)
//   3. CI lint (TODO) keeps the two in sync

export type Migration = {
  name: string;
  sql: string;
};

export const MIGRATIONS: Migration[] = [
  {
    name: "001_init.sql",
    sql: `
-- notfair-cmo SQLite schema, migration 001.
-- Forward-only; do not edit after release. New changes go in a new numbered migration.

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  archived_at  TEXT
);

-- Task lifecycle:
-- proposed -> approved -> running -> (succeeded | failed | cancelled)
CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY,
  project_slug     TEXT NOT NULL REFERENCES projects(slug),
  agent_id         TEXT NOT NULL,
  brief            TEXT NOT NULL,
  success_criteria TEXT,
  deadline_iso     TEXT,
  status           TEXT NOT NULL CHECK (status IN ('proposed','approved','running','succeeded','failed','cancelled')),
  result_json      TEXT,
  error_message    TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_slug);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(project_slug, status);

CREATE TABLE IF NOT EXISTS approvals (
  id                TEXT PRIMARY KEY,
  project_slug      TEXT NOT NULL REFERENCES projects(slug),
  agent_id          TEXT NOT NULL,
  action_summary    TEXT NOT NULL,
  action_type       TEXT NOT NULL CHECK (action_type IN ('spend','content_publishing','new_channel','bid_change','audience_change','other')),
  cost_estimate_usd REAL NOT NULL DEFAULT 0,
  reasoning         TEXT,
  payload_json      TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','expired')),
  created_at        TEXT NOT NULL,
  resolved_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_approvals_pending ON approvals(project_slug, status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS cost_events (
  id           TEXT PRIMARY KEY,
  project_slug TEXT NOT NULL REFERENCES projects(slug),
  agent_id     TEXT,
  source       TEXT NOT NULL CHECK (source IN ('llm','google_ads','gsc','other')),
  amount_usd   REAL NOT NULL,
  ref          TEXT,
  occurred_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_events_project_time ON cost_events(project_slug, occurred_at);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id                TEXT PRIMARY KEY,
  project_slug      TEXT NOT NULL REFERENCES projects(slug),
  provider          TEXT NOT NULL CHECK (provider IN ('google_ads','gsc')),
  account_label     TEXT NOT NULL,
  access_token_enc  TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  scope             TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE(project_slug, provider, account_label)
);

CREATE TABLE IF NOT EXISTS guardrails (
  project_slug TEXT PRIMARY KEY REFERENCES projects(slug),
  config_json  TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_actions (
  id            TEXT PRIMARY KEY,
  project_slug  TEXT NOT NULL REFERENCES projects(slug),
  agent_id      TEXT NOT NULL,
  task_id       TEXT,
  action_type   TEXT NOT NULL,
  summary       TEXT NOT NULL,
  reasoning     TEXT,
  payload_json  TEXT,
  occurred_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_actions_project_time ON agent_actions(project_slug, occurred_at);

CREATE TABLE IF NOT EXISTS sequence_runs (
  id            TEXT PRIMARY KEY,
  project_slug  TEXT NOT NULL REFERENCES projects(slug),
  agent_id      TEXT NOT NULL,
  sequence_kind TEXT NOT NULL,
  cursor        TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending','running','succeeded','failed','cancelled')),
  payload_json  TEXT,
  last_tick_at  TEXT,
  next_tick_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
`,
  },
  {
    name: "002_google_ads_account.sql",
    sql: `
-- Per-project Google Ads account selection. Bearers from notfair.co's MCP
-- can grant access to multiple customer accounts; onboarding asks the user
-- to pick one and persists it here so the audit + later automation always
-- target the right account.
ALTER TABLE projects ADD COLUMN google_ads_account_id TEXT;
`,
  },
  {
    name: "003_tasks_orchestration.sql",
    sql: `
-- Tasks gain three columns to power the autonomous CMO orchestrator:
--
--   title              — short label distinct from the long brief, shown
--                        on /tasks cards + task detail header.
--   thread_id          — the OpenClaw chat session id this task's
--                        per-task thread runs under. The assignee picks
--                        up the task in this thread (TASK_BRIEF.md
--                        kickoff). Null until the user (or the CMO
--                        autonomously) opens the detail page; populated
--                        once and immutable.
--   assigner_agent_id  — who created this task. CMO assigns to specialists;
--                        in v1.1 specialists can create sub-tasks and
--                        this lets us walk the chain back to the planner.
ALTER TABLE tasks ADD COLUMN title TEXT;
ALTER TABLE tasks ADD COLUMN thread_id TEXT;
ALTER TABLE tasks ADD COLUMN assigner_agent_id TEXT;
`,
  },
  {
    name: "004_task_display_id.sql",
    sql: `
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
`,
  },
  {
    name: "005_drop_guardrails.sql",
    sql: `
-- Remove the guardrails autonomy feature. The Settings page no longer
-- exposes per-project autonomy knobs and no runtime code reads/writes
-- this table, so drop it to keep the schema honest.
DROP TABLE IF EXISTS guardrails;
`,
  },
  {
    name: "006_approvals_v2.sql",
    sql: `
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
CREATE INDEX IF NOT EXISTS idx_approvals_actionable ON approvals(project_slug, status) WHERE status IN ('pending','revision_requested');
CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id) WHERE task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS approval_comments (
  id          TEXT PRIMARY KEY,
  approval_id TEXT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('user','agent','system')),
  author_id   TEXT,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approval_comments_approval ON approval_comments(approval_id, created_at);

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
`,
  },
  {
    name: "007_unify_task_status_vocab.sql",
    sql: `
-- Unify TaskStatus on the agent-facing verb form: running→working,
-- succeeded→done. SQLite can't ALTER CHECK in place — recreate the table
-- and transform existing rows via CASE. See 007_unify_task_status_vocab.sql
-- for the rationale.

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
`,
  },
  {
    name: "008_project_brief_and_task_blocks.sql",
    sql: `
-- Migration 008: project context inputs + task-blocks-task dependencies.
--
-- Two unrelated-looking changes ship together because they're the schema
-- side of the same product change: the new CMO onboarding task that learns
-- about the project (writes PROJECT.md), and the audit task gated on it.
--
-- 1. projects gains two optional inputs collected at onboarding time:
--    \`website_url\` and \`codebase_path\`. The CMO uses whichever are present
--    to research the project during its first task and produce PROJECT.md.
--
-- 2. tasks gains \`blocked_by_task_id\` — a generic "this task can't start
--    until that one finishes" pointer. When the blocker transitions to
--    \`done\`, the orchestrator clears the pointer, flips the dependent
--    blocked→proposed, and kicks it off. Co-exists with approval-blocking
--    (approval-blocked tasks have a null blocked_by_task_id and resolve
--    via the existing wakeTaskOnApprovalResolution path).
ALTER TABLE projects ADD COLUMN website_url TEXT;
ALTER TABLE projects ADD COLUMN codebase_path TEXT;

ALTER TABLE tasks ADD COLUMN blocked_by_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_blocked_by ON tasks(blocked_by_task_id) WHERE blocked_by_task_id IS NOT NULL;
`,
  },
  {
    name: "009_questions.sql",
    sql: `
-- Migration 009: questions table for ask_user_question.
--
-- Agents call the ask_user_question MCP tool to surface a structured
-- question to the user (with optional multiple-choice options). Previously
-- this only logged an action; now it persists a row, blocks the gating
-- task, and the UI renders a QuestionCard alongside ApprovalCard. The
-- user picks an option or types free-text; the wake-up streams the
-- resolution back to the agent.
--
-- Modeled like approvals: one row per question, pending → answered |
-- cancelled (terminal). No comments table — single-shot Q&A; if the
-- agent needs more, it asks again.

CREATE TABLE IF NOT EXISTS questions (
  id                  TEXT PRIMARY KEY,
  project_slug        TEXT NOT NULL REFERENCES projects(slug),
  agent_id            TEXT NOT NULL,
  task_id             TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  prompt              TEXT NOT NULL,
  options_json        TEXT NOT NULL DEFAULT '[]',
  status              TEXT NOT NULL CHECK (status IN ('pending','answered','cancelled')),
  answer_option_index INTEGER,
  answer_text         TEXT,
  resolved_by_kind    TEXT CHECK (resolved_by_kind IN ('user','system')),
  created_at          TEXT NOT NULL,
  resolved_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_questions_pending ON questions(project_slug, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_questions_task ON questions(task_id) WHERE task_id IS NOT NULL;
`,
  },
  {
    name: "010_harness_adapter.sql",
    sql: `
-- Migration 010: pivot off OpenClaw to harness adapters.
--
-- 1. \`projects.harness_adapter\` — which adapter (claude-code-local |
--    codex-local) runs this project's agents. Onboarding sets it; per-
--    project so different teams can pick different tools.
--
-- 2. \`mcp_tokens\` — per-project OAuth tokens for MCP servers
--    (notfair-googleads, etc.). Replaces the OpenClaw config-file storage
--    so we don't depend on the openclaw binary for token persistence.
--
-- 3. \`scheduled_jobs\` — native cron schedule rows. Replaces openclaw
--    cron CLI. A node-cron loop in the next process ticks these on their
--    cron_expr and dispatches a synthetic chat turn through the harness.
--
-- 4. \`sessions\` + \`transcript_events\` — native chat thread + event log.
--    Replaces OpenClaw's session-key namespace and JSONL transcript files.
--    One row per (agent, label) thread; transcript_events stores the
--    delta/tool/lifecycle events emitted by the adapter so the UI can
--    replay on re-attach.

ALTER TABLE projects ADD COLUMN harness_adapter TEXT NOT NULL DEFAULT 'claude-code-local';

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id                TEXT PRIMARY KEY,
  project_slug      TEXT NOT NULL REFERENCES projects(slug),
  server_name       TEXT NOT NULL,
  account_label     TEXT NOT NULL DEFAULT '',
  access_token_enc  TEXT NOT NULL,
  refresh_token_enc TEXT,
  expires_at        TEXT,
  scope             TEXT,
  metadata_json     TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE(project_slug, server_name, account_label)
);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_project ON mcp_tokens(project_slug);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id            TEXT PRIMARY KEY,
  project_slug  TEXT NOT NULL REFERENCES projects(slug),
  agent_id      TEXT NOT NULL,
  name          TEXT NOT NULL,
  cron_expr     TEXT NOT NULL,
  message       TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_run_at   TEXT,
  next_run_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(project_slug, agent_id, name)
);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next ON scheduled_jobs(enabled, next_run_at);

CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT PRIMARY KEY,
  project_slug        TEXT NOT NULL REFERENCES projects(slug),
  agent_id            TEXT NOT NULL,
  label               TEXT NOT NULL,
  harness_adapter     TEXT NOT NULL,
  harness_session_id  TEXT,
  task_id             TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE(project_slug, agent_id, label)
);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(project_slug, agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id) WHERE task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS transcript_events (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('user','delta','tool','lifecycle','final','error')),
  payload_json  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transcript_events_session ON transcript_events(session_id, seq);

CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  id              TEXT PRIMARY KEY,
  scheduled_job_id TEXT NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  status          TEXT NOT NULL CHECK (status IN ('running','done','failed')),
  error_message   TEXT
);
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job ON scheduled_job_runs(scheduled_job_id, started_at);
`,
  },
  {
    name: "011_user_mcp_servers.sql",
    sql: `
-- Migration 011: user-added MCP servers.
--
-- The Connections page used to render a hardcoded preset catalog
-- (notfair-googleads). Users now register arbitrary OAuth-2.0 MCP servers
-- (Stripe, Vercel, Supabase, etc.) from the UI. Each row is project-scoped
-- and joined alongside the preset list in \`getMcpCatalog\`.
--
-- The \`key\` column carries the same identifier that mcp_tokens.server_name
-- uses, so the OAuth callback + token storage + adapter registration paths
-- work without changes.

CREATE TABLE IF NOT EXISTS user_mcp_servers (
  id            TEXT PRIMARY KEY,
  project_slug  TEXT NOT NULL REFERENCES projects(slug),
  key           TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  resource_url  TEXT NOT NULL,
  discovery_url TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(project_slug, key)
);
CREATE INDEX IF NOT EXISTS idx_user_mcp_servers_project ON user_mcp_servers(project_slug);
`,
  },
  {
    name: "012_hidden_mcp_presets.sql",
    sql: `
-- Migration 012: per-project hide-list for preset MCP catalog entries.
--
-- Users can now "remove" a preset connector (NotFair Google Ads, etc.)
-- from a project's Connections page. Since the preset list is hardcoded
-- in source, removal stores the key in this column and getMcpCatalog
-- filters it out. Re-adding from "Browse connectors" deletes the key
-- here, so the preset reappears.

ALTER TABLE projects
  ADD COLUMN hidden_mcp_preset_keys_json TEXT NOT NULL DEFAULT '[]';
`,
  },
  {
    name: "013_mcp_token_oauth_client.sql",
    sql: `
-- Migration 013: persist OAuth client + token endpoint on mcp_tokens.
--
-- Refresh-token rotation needs three things at runtime: the token endpoint
-- URL, the dynamically-registered client_id, and (where the server requires
-- it) the client_secret. We have all three in mcp_oauth_pending during the
-- authorize flow but used to throw them away after the callback finished.
-- Persisting them here lets the refresh helper exchange a refresh_token for
-- a fresh access_token without bouncing the user back through consent.
--
-- All three columns are nullable. Pre-existing rows (created before this
-- migration) have no refresh_token captured either, so they fall through to
-- the "reconnect to fix" path on next 401 — exactly the behavior they had
-- before. New rows written by the patched callback will populate them.

ALTER TABLE mcp_tokens ADD COLUMN token_endpoint TEXT;
ALTER TABLE mcp_tokens ADD COLUMN client_id      TEXT;
ALTER TABLE mcp_tokens ADD COLUMN client_secret  TEXT;
`,
  },
  {
    name: "014_scheduled_job_run_summary.sql",
    sql: `
-- Migration 014: capture a short summary on every cron run so the calendar
-- detail dialog can show what actually happened. dispatchJob accumulates the
-- adapter's final/delta text and writes it on finishJobRun.

ALTER TABLE scheduled_job_runs ADD COLUMN summary TEXT;
`,
  },
  {
    name: "015_meta_ads_and_gsc_accounts.sql",
    sql: `
-- Per-project Meta Ads and Google Search Console account/property
-- selection — same pattern as google_ads_account_id (migration 002).
-- The notfair-metaads bearer can cover multiple ad accounts; the
-- notfair-googlesearchconsole bearer can cover multiple verified
-- properties. Onboarding asks the user to pick one of each (when the
-- token has >1) so the specialist agents always target the right
-- entity. Null until picked.

ALTER TABLE projects ADD COLUMN meta_ads_account_id TEXT;
ALTER TABLE projects ADD COLUMN gsc_property_id     TEXT;
`,
  },
];
