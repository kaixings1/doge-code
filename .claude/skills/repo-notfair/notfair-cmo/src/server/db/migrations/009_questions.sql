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
