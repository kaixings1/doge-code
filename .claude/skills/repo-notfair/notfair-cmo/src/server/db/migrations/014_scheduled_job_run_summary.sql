-- Migration 014: capture a short summary on every cron run so the calendar
-- detail dialog can show what actually happened. dispatchJob accumulates the
-- adapter's final/delta text and writes it on finishJobRun.

ALTER TABLE scheduled_job_runs ADD COLUMN summary TEXT;
