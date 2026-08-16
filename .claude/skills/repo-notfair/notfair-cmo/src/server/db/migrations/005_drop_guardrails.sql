-- Remove the guardrails autonomy feature. The Settings page no longer
-- exposes per-project autonomy knobs and no runtime code reads/writes
-- this table, so drop it to keep the schema honest.
DROP TABLE IF EXISTS guardrails;
