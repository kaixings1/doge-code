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
-- proposed → approved → running → (succeeded | failed | cancelled)
-- See src/types/index.ts for the ASCII state diagram.
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

-- Append-only audit log of every autonomous action.
-- Powers the "Why?" command and post-hoc cost/decision review.
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

-- Cursor for long-running multi-tick agent work (e.g., cold email sequences).
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
